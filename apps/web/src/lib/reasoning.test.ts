import { describe, it, expect } from "vitest";
import {
  DEFAULT_EFFORT,
  EFFORT_LABELS,
  getEffortCapability,
  resolveEffortFor,
  toReasoningOption,
  type EffortLevel,
} from "./reasoning";
import type { OpenRouterReasoning, ProviderModel } from "@/lib/models";

/** An OpenRouter entry carrying the `reasoning` object discovery records. */
function orModel(id: string, reasoning?: OpenRouterReasoning): ProviderModel {
  return { id, name: id, provider: "openrouter", ...(reasoning ? { reasoning } : {}) };
}

describe("EFFORT_LABELS", () => {
  it("labels every level", () => {
    const levels: EffortLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
    for (const level of levels) {
      expect(EFFORT_LABELS[level]).toBeTruthy();
    }
  });
});

describe("getEffortCapability", () => {
  // Payloads below are verbatim from a live GET /api/v1/models response.
  it("omits 'off' for a model that cannot stop reasoning", () => {
    const cap = getEffortCapability(
      orModel("x-ai/grok-4.5", {
        mandatory: true,
        default_enabled: true,
        supported_efforts: ["high", "medium", "low"],
        default_effort: "high",
      })
    );
    expect(cap?.levels).toEqual(["low", "medium", "high"]);
    expect(cap?.defaultEffort).toBe("high");
    expect(cap?.thinkingLevelMap?.off).toBeNull();
  });

  it("offers only the levels OpenRouter lists", () => {
    const cap = getEffortCapability(
      orModel("deepseek/deepseek-v4-pro", {
        mandatory: false,
        supported_efforts: ["xhigh", "high"],
        default_effort: "high",
      })
    );
    expect(cap?.levels).toEqual(["off", "high", "xhigh"]);
  });

  it("surfaces a 'max'-only ladder as xhigh, sent on the wire as 'max'", () => {
    const cap = getEffortCapability(
      orModel("moonshotai/kimi-k3", {
        mandatory: false,
        default_enabled: true,
        supported_efforts: ["max", "high", "low"],
        default_effort: "max",
      })
    );
    expect(cap?.levels).toEqual(["off", "low", "high", "xhigh"]);
    expect(cap?.thinkingLevelMap?.xhigh).toBe("max");
    expect(cap?.defaultEffort).toBe("xhigh");
  });

  it("prefers the exact name when a model lists both xhigh and max", () => {
    const cap = getEffortCapability(
      orModel("vendor/both", { supported_efforts: ["max", "xhigh", "low"] })
    );
    expect(cap?.thinkingLevelMap?.xhigh).toBe("xhigh");
  });

  it("keeps OpenRouter's own default effort", () => {
    const cap = getEffortCapability(
      orModel("google/gemini-3.6-flash", {
        mandatory: true,
        default_enabled: true,
        supported_efforts: ["high", "medium", "low", "minimal"],
        default_effort: "medium",
      })
    );
    expect(cap?.levels).toEqual(["minimal", "low", "medium", "high"]);
    expect(cap?.defaultEffort).toBe("medium");
  });

  it("falls back to the app default when OpenRouter names none", () => {
    const cap = getEffortCapability(
      orModel("vendor/no-default", { supported_efforts: ["high", "medium", "low"] })
    );
    expect(cap?.defaultEffort).toBe(DEFAULT_EFFORT);
  });

  it("clamps the app default onto a ladder that omits it", () => {
    const cap = getEffortCapability(orModel("vendor/coarse", { supported_efforts: ["high", "low"] }));
    expect(cap?.levels).not.toContain(DEFAULT_EFFORT);
    expect(cap?.levels).toContain(cap?.defaultEffort as EffortLevel);
  });

  it("clamps a default effort the model does not actually list", () => {
    const cap = getEffortCapability(
      orModel("vendor/odd", { supported_efforts: ["low"], default_effort: "xhigh" })
    );
    // ["off", "low"] — "xhigh" has to come down to something offered.
    expect(cap?.levels).toContain(cap?.defaultEffort as EffortLevel);
  });

  it("returns null for a model with no discrete levels", () => {
    // ~93 models advertise reasoning without supported_efforts; nothing to pick.
    expect(getEffortCapability(orModel("minimax/minimax-m3", { mandatory: false }))).toBeNull();
    expect(getEffortCapability(orModel("vendor/empty", { supported_efforts: [] }))).toBeNull();
  });

  it("returns null for a model with no reasoning object at all", () => {
    expect(getEffortCapability(orModel("openai/gpt-4o"))).toBeNull();
  });

  // OpenRouter's metadata is the only source — pi-ai's registry is never
  // consulted. These ids ARE in that registry with reasoning levels; if the
  // fallback ever comes back, these are the tests that catch it.
  it("never consults pi-ai's registry, whatever the provider", () => {
    expect(
      getEffortCapability({
        provider: "anthropic",
        id: "claude-sonnet-4-20250514",
        name: "Sonnet 4",
      })
    ).toBeNull();
    expect(getEffortCapability({ provider: "openai", id: "gpt-5", name: "GPT-5" })).toBeNull();
    // Known to the registry with five levels; OpenRouter says it exposes none.
    expect(getEffortCapability(orModel("minimax/minimax-m3", { mandatory: false }))).toBeNull();
  });
});

describe("resolveEffortFor", () => {
  const capability = getEffortCapability(
    orModel("vendor/full", { supported_efforts: ["minimal", "low", "medium", "high"] })
  )!;

  it("falls back to the capability's default when nothing is stored", () => {
    expect(resolveEffortFor(capability, undefined)).toBe(DEFAULT_EFFORT);
  });

  it("keeps a stored level the model supports", () => {
    expect(resolveEffortFor(capability, "low")).toBe("low");
  });

  it("clamps a stored level down to what the model supports", () => {
    // Tops out at "high" — a stored "xhigh" must clamp down.
    expect(resolveEffortFor(capability, "xhigh")).toBe("high");
  });

  it("clamps a stored 'off' up for a model that cannot stop reasoning", () => {
    const mandatory = getEffortCapability(
      orModel("x-ai/grok-4.5", { mandatory: true, supported_efforts: ["high", "medium", "low"] })
    )!;
    expect(resolveEffortFor(mandatory, "off")).not.toBe("off");
  });
});

describe("toReasoningOption", () => {
  // Providers test this option for truthiness: the string "off" would read as
  // "thinking enabled" (and, for Anthropic, fall through to effort "high").
  it("maps 'off' to undefined so no reasoning parameter is sent", () => {
    expect(toReasoningOption("off")).toBeUndefined();
  });

  it("passes every other level through unchanged", () => {
    for (const level of ["minimal", "low", "medium", "high", "xhigh"] as const) {
      expect(toReasoningOption(level)).toBe(level);
    }
  });
});
