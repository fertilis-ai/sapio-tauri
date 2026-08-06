import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchProviderModels,
  fetchAllProviderModels,
  fetchOpenRouterImageModels,
  fetchOpenRouterTranscriptionModels,
  fetchOpenRouterSpeechModels,
} from "./provider-models";

const mockAppFetch = vi.fn();

vi.mock("@/lib/http", () => ({
  appFetch: (...args: unknown[]) => mockAppFetch(...args),
}));

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

describe("fetchProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("anthropic", () => {
    it("fetches and maps Anthropic models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "claude-3-opus", display_name: "Claude 3 Opus" },
            { id: "claude-3-sonnet" },
          ],
        })
      );

      const result = await fetchProviderModels("anthropic", "sk-test");
      expect(result.provider).toBe("anthropic");
      expect(result.models).toHaveLength(2);
      expect(result.models[0]).toEqual({
        id: "claude-3-opus",
        name: "Claude 3 Opus",
        provider: "anthropic",
      });
      expect(result.models[1]).toEqual({
        id: "claude-3-sonnet",
        name: "claude-3-sonnet",
        provider: "anthropic",
      });
    });

    it("sends correct headers", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
      await fetchProviderModels("anthropic", "  sk-key  ");
      expect(mockAppFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.anthropic.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "sk-key",
            "anthropic-version": "2023-06-01",
          }),
        })
      );
    });

    it("returns error on non-OK response", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({ error: { message: "Invalid API Key" } }, false, 401)
      );
      const result = await fetchProviderModels("anthropic", "bad-key");
      expect(result.error).toContain("401");
      expect(result.error).toContain("Invalid API Key");
      expect(result.models).toEqual([]);
    });

    it("returns error on fetch exception", async () => {
      mockAppFetch.mockRejectedValue(new Error("Network error"));
      const result = await fetchProviderModels("anthropic", "sk-test");
      expect(result.error).toContain("Network error");
      expect(result.models).toEqual([]);
    });
  });

  describe("openai", () => {
    it("fetches and filters OpenAI chat models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "gpt-4o" },
            { id: "gpt-4o-mini" },
            { id: "dall-e-3" },
            { id: "whisper-1" },
            { id: "text-embedding-3-small" },
            { id: "gpt-4o-realtime-preview" },
            { id: "o1-preview" },
            { id: "chatgpt-4o-latest" },
          ],
        })
      );

      const result = await fetchProviderModels("openai", "sk-test");
      expect(result.provider).toBe("openai");
      const ids = result.models.map((m) => m.id);
      expect(ids).toContain("gpt-4o");
      expect(ids).toContain("gpt-4o-mini");
      expect(ids).toContain("o1-preview");
      expect(ids).toContain("chatgpt-4o-latest");
      expect(ids).not.toContain("dall-e-3");
      expect(ids).not.toContain("whisper-1");
      expect(ids).not.toContain("text-embedding-3-small");
      expect(ids).not.toContain("gpt-4o-realtime-preview");
    });

    it("excludes audio models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "gpt-4o-audio-preview" },
            { id: "gpt-4o" },
          ],
        })
      );
      const result = await fetchProviderModels("openai", "sk-test");
      const ids = result.models.map((m) => m.id);
      expect(ids).toContain("gpt-4o");
      expect(ids).not.toContain("gpt-4o-audio-preview");
    });

    it("sends Authorization header", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
      await fetchProviderModels("openai", " sk-key ");
      expect(mockAppFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.openai.com"),
        expect.objectContaining({
          headers: { Authorization: "Bearer sk-key" },
        })
      );
    });
  });

  describe("google", () => {
    it("fetches and filters Google generateContent models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          models: [
            {
              name: "models/gemini-1.5-pro",
              displayName: "Gemini 1.5 Pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embedding-001",
              displayName: "Embedding 001",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        })
      );

      const result = await fetchProviderModels("google", "key-123");
      expect(result.provider).toBe("google");
      expect(result.models).toHaveLength(1);
      expect(result.models[0]).toEqual({
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        provider: "google",
      });
    });

    it("strips models/ prefix from id", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          models: [
            {
              name: "models/gemini-2.0-flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        })
      );
      const result = await fetchProviderModels("google", "key");
      expect(result.models[0].id).toBe("gemini-2.0-flash");
    });

    it("includes API key in URL", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ models: [] }));
      await fetchProviderModels("google", " my-key ");
      expect(mockAppFetch).toHaveBeenCalledWith(
        expect.stringContaining("key=my-key")
      );
    });
  });

  describe("openrouter", () => {
    it("fetches OpenRouter models", async () => {
      mockAppFetch.mockResolvedValue(
        jsonResponse({
          data: [
            { id: "anthropic/claude-3", name: "Claude 3" },
            { id: "meta/llama-3" },
          ],
        })
      );

      const result = await fetchProviderModels("openrouter", "or-key");
      expect(result.provider).toBe("openrouter");
      expect(result.models).toHaveLength(2);
      expect(result.models[0].name).toBe("Claude 3");
      expect(result.models[1].name).toBe("meta/llama-3");
    });

    it("works without an API key", async () => {
      mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
      const result = await fetchProviderModels("openrouter", "");
      expect(result.provider).toBe("openrouter");
      expect(result.models).toEqual([]);
    });

    it("filters out non-text models", async () => {
      mockAppFetch.mockImplementation((url: string) => {
        if (url.includes("/endpoints/zdr")) return Promise.resolve(jsonResponse({ data: [] }));
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: "anthropic/claude-3",
                name: "Claude 3",
                architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
              },
              {
                id: "openai/gpt-image-1",
                name: "GPT Image",
                architecture: { input_modalities: ["text"], output_modalities: ["image", "text"] },
              },
              {
                id: "openai/tts-1",
                name: "TTS",
                architecture: { input_modalities: ["text"], output_modalities: ["audio"] },
              },
              {
                id: "openai/whisper-1",
                name: "Whisper",
                architecture: { input_modalities: ["audio"], output_modalities: ["text"] },
              },
              { id: "meta/no-architecture", name: "No Arch" },
            ],
          })
        );
      });

      const result = await fetchProviderModels("openrouter", "or-key");
      expect(result.models.map((m) => m.id)).toEqual([
        "anthropic/claude-3",
        "meta/no-architecture",
      ]);
    });

    it("flags models with zero-data-retention endpoints", async () => {
      mockAppFetch.mockImplementation((url: string) => {
        if (url.includes("/endpoints/zdr")) {
          return Promise.resolve(
            jsonResponse({ data: [{ model_id: "anthropic/claude-3" }, { model_id: "other/model" }] })
          );
        }
        return Promise.resolve(
          jsonResponse({
            data: [
              { id: "anthropic/claude-3", name: "Claude 3" },
              { id: "meta/llama-3", name: "Llama 3" },
            ],
          })
        );
      });

      const result = await fetchProviderModels("openrouter", "or-key");
      expect(result.models.find((m) => m.id === "anthropic/claude-3")?.zdr).toBe(true);
      expect(result.models.find((m) => m.id === "meta/llama-3")?.zdr).toBeUndefined();
    });

    it("copies the reasoning capability through, and omits it when absent", async () => {
      // This object is what gates the chat toolbar's effort picker; dropping it
      // here silently falls the picker back to pi-ai's coarser registry.
      const reasoning = {
        mandatory: true,
        default_enabled: true,
        supported_efforts: ["high", "medium", "low"],
        default_effort: "high",
      };
      mockAppFetch.mockImplementation((url: string) => {
        if (url.includes("/endpoints/zdr")) return Promise.resolve(jsonResponse({ data: [] }));
        return Promise.resolve(
          jsonResponse({
            data: [
              { id: "x-ai/grok-4.5", name: "Grok 4.5", reasoning },
              { id: "openai/gpt-4o", name: "GPT-4o" },
            ],
          })
        );
      });

      const result = await fetchProviderModels("openrouter", "or-key");
      expect(result.models.find((m) => m.id === "x-ai/grok-4.5")?.reasoning).toEqual(reasoning);
      const plain = result.models.find((m) => m.id === "openai/gpt-4o");
      expect(plain).toBeDefined();
      expect(plain).not.toHaveProperty("reasoning");
    });

    it("tolerates a failed ZDR fetch", async () => {
      mockAppFetch.mockImplementation((url: string) => {
        if (url.includes("/endpoints/zdr")) return Promise.reject(new Error("network down"));
        return Promise.resolve(jsonResponse({ data: [{ id: "anthropic/claude-3", name: "Claude 3" }] }));
      });

      const result = await fetchProviderModels("openrouter", "or-key");
      expect(result.error).toBeUndefined();
      expect(result.models).toHaveLength(1);
      expect(result.models[0].zdr).toBeUndefined();
    });
  });

  describe("unknown provider", () => {
    it("returns error for unknown provider", async () => {
      const result = await fetchProviderModels("unknown-provider", "key");
      expect(result.error).toContain("Unknown provider");
      expect(result.models).toEqual([]);
    });
  });

  describe("error response parsing", () => {
    it("extracts message from JSON error body", async () => {
      mockAppFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(JSON.stringify({ message: "Forbidden" })),
      } as unknown as Response);
      const result = await fetchProviderModels("anthropic", "key");
      expect(result.error).toContain("403");
      expect(result.error).toContain("Forbidden");
    });

    it("returns plain text error body when short", async () => {
      mockAppFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as unknown as Response);
      const result = await fetchProviderModels("anthropic", "key");
      expect(result.error).toContain("500");
      expect(result.error).toContain("Internal Server Error");
    });

    it("falls back to HTTP status when body is long", async () => {
      mockAppFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("x".repeat(300)),
      } as unknown as Response);
      const result = await fetchProviderModels("anthropic", "key");
      expect(result.error).toBe("HTTP 500");
    });
  });
});

describe("fetchAllProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches from all providers with keys", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [], models: [] }));

    const results = await fetchAllProviderModels({
      anthropic: "ak",
      openai: "ok",
      google: "gk",
    });

    // anthropic, openai, google, plus openrouter (always included)
    expect(results).toHaveLength(4);
  });

  it("always includes openrouter even without a key", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [], models: [] }));

    const results = await fetchAllProviderModels({});
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe("openrouter");
  });

  it("skips providers with empty/whitespace keys", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [], models: [] }));

    const results = await fetchAllProviderModels({
      anthropic: "  ",
      openai: "",
      google: "gk",
    });

    // google + openrouter
    expect(results).toHaveLength(2);
    const providers = results.map((r) => r.provider);
    expect(providers).toContain("google");
    expect(providers).toContain("openrouter");
  });
});

describe("fetchOpenRouterImageModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and maps image models with editing capability", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "openai/gpt-image-1",
            name: "GPT Image 1",
            architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
          },
          {
            id: "some/text-to-image",
            architecture: { input_modalities: ["text"], output_modalities: ["image"] },
          },
        ],
      })
    );

    const result = await fetchOpenRouterImageModels("sk-or-key");
    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/images/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-or-key" }),
      })
    );
    expect(result.models).toEqual([
      { id: "openai/gpt-image-1", name: "GPT Image 1", supportsImageInput: true },
      { id: "some/text-to-image", name: "some/text-to-image", supportsImageInput: false },
    ]);
  });

  it("filters out models without image output", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({
        data: [
          { id: "text/model", architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
        ],
      })
    );
    const result = await fetchOpenRouterImageModels("key");
    expect(result.models).toHaveLength(0);
  });

  it("returns error on non-OK response", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({ error: { message: "Unauthorized" } }, false, 401)
    );
    const result = await fetchOpenRouterImageModels("bad-key");
    expect(result.models).toHaveLength(0);
    expect(result.error).toContain("401");
  });

  it("returns error on network failure", async () => {
    mockAppFetch.mockRejectedValue(new Error("offline"));
    const result = await fetchOpenRouterImageModels("key");
    expect(result.error).toContain("offline");
  });
});

describe("fetchOpenRouterTranscriptionModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and maps transcription models", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({
        data: [
          { id: "openai/whisper-large-v3", name: "Whisper Large V3" },
          { id: "openai/gpt-4o-mini-transcribe" },
        ],
      })
    );

    const result = await fetchOpenRouterTranscriptionModels("sk-or-key");
    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?output_modalities=transcription",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-or-key" }),
      })
    );
    expect(result.models).toEqual([
      { id: "openai/whisper-large-v3", name: "Whisper Large V3" },
      { id: "openai/gpt-4o-mini-transcribe", name: "openai/gpt-4o-mini-transcribe" },
    ]);
  });

  it("omits the Authorization header when no key is provided", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchOpenRouterTranscriptionModels();
    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?output_modalities=transcription",
      { headers: {} }
    );
  });

  it("returns error on non-OK response", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({ error: { message: "Unauthorized" } }, false, 401)
    );
    const result = await fetchOpenRouterTranscriptionModels("bad-key");
    expect(result.models).toHaveLength(0);
    expect(result.error).toContain("401");
  });

  it("returns error on network failure", async () => {
    mockAppFetch.mockRejectedValue(new Error("offline"));
    const result = await fetchOpenRouterTranscriptionModels("key");
    expect(result.error).toContain("offline");
  });
});

describe("fetchOpenRouterSpeechModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and maps speech models with their voices", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({
        data: [
          { id: "x-ai/grok-voice-tts-1.0", name: "Grok Voice TTS", supported_voices: ["eve", "ara"] },
          { id: "acme/voiceless-tts" },
        ],
      })
    );

    const result = await fetchOpenRouterSpeechModels("sk-or-key");
    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?output_modalities=speech",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-or-key" }),
      })
    );
    expect(result.models).toEqual([
      { id: "x-ai/grok-voice-tts-1.0", name: "Grok Voice TTS", voices: ["eve", "ara"] },
      { id: "acme/voiceless-tts", name: "acme/voiceless-tts", voices: [] },
    ]);
  });

  it("omits the Authorization header when no key is provided", async () => {
    mockAppFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchOpenRouterSpeechModels();
    expect(mockAppFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?output_modalities=speech",
      { headers: {} }
    );
  });

  it("returns error on non-OK response", async () => {
    mockAppFetch.mockResolvedValue(
      jsonResponse({ error: { message: "Unauthorized" } }, false, 401)
    );
    const result = await fetchOpenRouterSpeechModels("bad-key");
    expect(result.models).toHaveLength(0);
    expect(result.error).toContain("401");
  });

  it("returns error on network failure", async () => {
    mockAppFetch.mockRejectedValue(new Error("offline"));
    const result = await fetchOpenRouterSpeechModels("key");
    expect(result.error).toContain("offline");
  });
});
