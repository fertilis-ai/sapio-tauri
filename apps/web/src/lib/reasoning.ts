import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  type Api,
  type Model,
  type ModelThinkingLevel,
  type ThinkingLevel,
  type ThinkingLevelMap,
} from "@earendil-works/pi-ai";
import type { OpenRouterReasoning, ProviderModel } from "@/lib/models";

/**
 * A reasoning-effort level as shown in the UI. Same set as pi-ai's
 * `ModelThinkingLevel`: "off" | "minimal" | "low" | "medium" | "high" | "xhigh".
 */
export type EffortLevel = ModelThinkingLevel;

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Max",
};

/** Level used when a reasoning model has no stored preference yet. */
export const DEFAULT_EFFORT: EffortLevel = "medium";

/**
 * Convert a UI effort level into pi-ai's `reasoning` stream option.
 *
 * This is the only place "off" is translated, and it must stay that way:
 * `ThinkingLevel` deliberately excludes "off", and providers test the option
 * for truthiness — `streamSimpleAnthropic` would read the string "off" as
 * "thinking enabled" and fall through to effort "high".
 */
export function toReasoningOption(level: EffortLevel): ThinkingLevel | undefined {
  return level === "off" ? undefined : level;
}

// ============================================================================
// OpenRouter capability
// ============================================================================

/**
 * What a model can be asked to do, in the vocabulary the picker and the SDK
 * share. `thinkingLevelMap` is the single representation: the level list is
 * derived from it, and attaching it to the pi-ai `Model` makes the outgoing
 * request agree with the picker by construction.
 */
export interface EffortCapability {
  /** Ordered, already filtered to what the model accepts. Never shorter than 2. */
  levels: EffortLevel[];
  /** Level used when there is no stored preference for this model. */
  defaultEffort: EffortLevel;
  /** `undefined` means "no restrictions" — pi-ai's own shorthand for the full set. */
  thinkingLevelMap: ThinkingLevelMap | undefined;
}

/**
 * Translate one of OpenRouter's effort names into our vocabulary.
 *
 * OpenRouter's ladder runs none < minimal < low < medium < high < xhigh < max,
 * one rung longer than pi-ai's `ModelThinkingLevel`. "max" therefore folds into
 * "xhigh" — see {@link getOpenRouterCapability} for why that is safe.
 */
function toEffortLevel(effort: string): EffortLevel | null {
  switch (effort) {
    case "none":
      return "off";
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return effort;
    default:
      return null;
  }
}

/**
 * Which level an OpenRouter effort name stands for, given the wire values this
 * model turned out to use. Falls back to the reverse of `wireValues` so aliases
 * resolved during the fold (notably "max" → xhigh) map back the same way.
 */
function resolveEffortName(
  effort: string,
  wireValues: Map<EffortLevel, string>
): EffortLevel | null {
  const direct = toEffortLevel(effort);
  if (direct) return direct;
  for (const [level, wire] of wireValues) {
    if (wire === effort) return level;
  }
  return null;
}

/** A stand-in `Model` for clamping against a bare map, before any real model exists. */
function capabilityModel(thinkingLevelMap: ThinkingLevelMap | undefined): Model<Api> {
  return { reasoning: true, thinkingLevelMap } as unknown as Model<Api>;
}

/**
 * Effort capability from OpenRouter's per-model `reasoning` metadata, or `null`
 * when there is nothing to pick.
 *
 * OpenRouter's metadata is the **only** source. pi-ai's registry is deliberately
 * not consulted, even as a fallback: it is both stale and coarse, and mixing the
 * two produced answers that were exactly backwards — no picker for
 * `x-ai/grok-4.5` (absent from the registry) while `minimax/minimax-m3` got a
 * five-level one it does not actually accept.
 *
 * Consequences of that, both intended:
 * - Models with a `reasoning` object but no `supported_efforts` return `null`.
 *   They can reason, but expose no discrete levels, so there is nothing to pick.
 * - Models from any other provider return `null` — no equivalent endpoint exists,
 *   so we have no trustworthy level set for them.
 * - Entries selected before discovery recorded `reasoning` return `null` until
 *   Settings → Models → Refresh re-syncs them.
 */
export function getEffortCapability(entry: ProviderModel): EffortCapability | null {
  const meta: OpenRouterReasoning | undefined = entry.reasoning;
  const efforts = meta?.supported_efforts;
  if (!meta || !efforts || efforts.length === 0) return null;

  // "max" only stands in for "xhigh" when the model doesn't list "xhigh" too:
  // some models offer both, and there we'd rather send the exact name. Models
  // topping out at "max" (moonshotai/kimi-k3) would otherwise lose their
  // highest level. EFFORT_LABELS already renders "xhigh" as "Max".
  const wireValues = new Map<EffortLevel, string>();
  for (const effort of efforts) {
    const level = toEffortLevel(effort);
    if (level) wireValues.set(level, effort);
  }
  if (efforts.includes("max") && !wireValues.has("xhigh")) wireValues.set("xhigh", "max");

  // null marks a level as unsupported; "off" is null only when the model can't
  // stop reasoning at all. pi-ai reads an absent/`"none"` off entry as "send
  // reasoning: { effort: 'none' }", which is how OpenRouter disables it.
  const thinkingLevelMap: ThinkingLevelMap = {};
  for (const level of ["minimal", "low", "medium", "high", "xhigh"] as const) {
    thinkingLevelMap[level] = wireValues.get(level) ?? null;
  }
  thinkingLevelMap.off = meta.mandatory ? null : (wireValues.get("off") ?? "none");

  const levels = getSupportedThinkingLevels(capabilityModel(thinkingLevelMap));
  if (levels.length < 2) return null;

  // `default_effort` is drawn from the same vocabulary, so it needs the same
  // folding — the reverse lookup is what catches "max" (kimi-k3 defaults to it,
  // and would otherwise be clamped down to "high").
  const wanted = meta.default_effort ? resolveEffortName(meta.default_effort, wireValues) : null;
  return {
    levels,
    defaultEffort: clampThinkingLevel(capabilityModel(thinkingLevelMap), wanted ?? DEFAULT_EFFORT),
    thinkingLevelMap,
  };
}

/** Clamp a stored (possibly stale) level onto one this capability allows. */
export function resolveEffortFor(
  capability: EffortCapability,
  stored: EffortLevel | undefined
): EffortLevel {
  return clampThinkingLevel(
    capabilityModel(capability.thinkingLevelMap),
    stored ?? capability.defaultEffort
  );
}
