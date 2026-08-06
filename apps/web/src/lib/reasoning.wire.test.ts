/**
 * End-to-end check on the JSON body that actually reaches OpenRouter.
 *
 * The unit tests in `reasoning.test.ts` stop at our own vocabulary; everything
 * past that is pi-ai's, and the failure modes there are all silent — a dropped
 * `reasoning` field or an unrequested `{ effort: "none" }` looks exactly like a
 * working request. So these drive pi-ai's real provider over a stubbed
 * transport and assert on the serialized body.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { streamSimple, type Api, type Model } from "@earendil-works/pi-ai";
import { getEffortCapability, resolveEffortFor, toReasoningOption } from "./reasoning";
import type { ProviderModel } from "@/lib/models";

/** Bodies captured from the stubbed transport, newest last. */
let bodies: Record<string, unknown>[] = [];
const realFetch = globalThis.fetch;

function sseResponse() {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"hi"},"index":0}]}\n\n',
    "data: [DONE]\n\n",
  ];
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

beforeEach(() => {
  bodies = [];
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    if (init?.body) bodies.push(JSON.parse(init.body));
    return sseResponse();
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Builds the model exactly as chat-store's resolveModelObject does, including the
 * registry-leak scenario: `base` stands in for what pi-ai's registry returned.
 */
function buildModel(entry: ProviderModel, base: Partial<Model<Api>> = {}): Model<Api> {
  const capability = getEffortCapability(entry);
  const reasoningFields = capability
    ? { reasoning: true as const, thinkingLevelMap: capability.thinkingLevelMap }
    : { reasoning: false as const, thinkingLevelMap: undefined };
  return {
    id: entry.id,
    name: entry.name,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    ...base,
    ...reasoningFields,
    headers: { Authorization: "Bearer sk-or-test" },
    compat: { supportsStore: false, supportsDeveloperRole: false },
  } as unknown as Model<Api>;
}

async function send(entry: ProviderModel, stored: string | undefined, base?: Partial<Model<Api>>) {
  const model = buildModel(entry, base);
  const capability = getEffortCapability(entry);
  const reasoning = capability
    ? toReasoningOption(resolveEffortFor(capability, stored as never))
    : undefined;
  const stream = streamSimple(
    model,
    { systemPrompt: "s", messages: [{ role: "user", content: "hi" }] } as never,
    { apiKey: "sk-or-test", reasoning } as never
  );
  for await (const _ of stream) {
    /* drain */
  }
  return bodies.at(-1);
}

const or = (id: string, reasoning?: unknown): ProviderModel =>
  ({ id, name: id, provider: "openrouter", ...(reasoning ? { reasoning } : {}) }) as ProviderModel;

describe("wire format actually sent to OpenRouter", () => {
  it("sends the picked effort", async () => {
    const body = await send(
      or("x-ai/grok-4.5", { mandatory: true, supported_efforts: ["high", "medium", "low"] }),
      "low"
    );
    expect(body?.reasoning).toEqual({ effort: "low" });
  });

  it("sends the folded wire name for a max-only ladder", async () => {
    const body = await send(
      or("moonshotai/kimi-k3", { supported_efforts: ["max", "high", "low"], default_effort: "max" }),
      "xhigh"
    );
    // Picker shows "Max"; the wire value must be OpenRouter's own "max".
    expect(body?.reasoning).toEqual({ effort: "max" });
  });

  it("disables reasoning when the user picks Off", async () => {
    const body = await send(
      or("vendor/optional", { supported_efforts: ["high", "low"] }),
      "off"
    );
    expect(body?.reasoning).toEqual({ effort: "none" });
  });

  it("sends no reasoning at all for a model with no discrete levels, even when the registry claims otherwise", async () => {
    const body = await send(or("deepseek/deepseek-r1", { mandatory: true, default_enabled: true }), undefined, {
      // pi-ai's registry view of the same model — must not leak onto the wire.
      reasoning: true,
      thinkingLevelMap: { xhigh: "max" },
    } as Partial<Model<Api>>);
    expect(body?.reasoning).toBeUndefined();
  });

  it("sends no reasoning for a plain non-reasoning model", async () => {
    const body = await send(or("openai/gpt-4o"), "high");
    expect(body?.reasoning).toBeUndefined();
  });
});
