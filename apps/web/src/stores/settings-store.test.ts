import { describe, it, expect, beforeEach, vi } from "vitest";

const mockStoreApiKey = vi.fn().mockResolvedValue(undefined);
const mockSetLoggingEnabled = vi.fn();
const mockFetchAllProviderModels = vi.fn();
const mockFetchOpenRouterImageModels = vi.fn();
const mockFetchOpenRouterTranscriptionModels = vi.fn();
const mockFetchOpenRouterSpeechModels = vi.fn();
const mockGetPresetConfig = vi.fn();

// Mock zustand persist to be a passthrough (avoids localStorage issues in
// tests) while capturing the options so version/migrate can be asserted.
// vi.hoisted avoids the TDZ on module-level lets (vi.mock factories run
// during hoisted imports, before let initializers).
const persistCapture = vi.hoisted(() => ({
  options: undefined as Record<string, unknown> | undefined,
}));
vi.mock("zustand/middleware", () => ({
  persist: (fn: unknown, options: Record<string, unknown>) => {
    persistCapture.options = options;
    return fn;
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/keychain", () => ({
  storeApiKey: (...args: unknown[]) => mockStoreApiKey(...args),
}));

vi.mock("@/lib/logger", () => ({
  setLoggingEnabled: (...args: unknown[]) => mockSetLoggingEnabled(...args),
}));

vi.mock("@/lib/provider-models", () => ({
  fetchAllProviderModels: (...args: unknown[]) => mockFetchAllProviderModels(...args),
  fetchOpenRouterImageModels: (...args: unknown[]) => mockFetchOpenRouterImageModels(...args),
  fetchOpenRouterTranscriptionModels: (...args: unknown[]) =>
    mockFetchOpenRouterTranscriptionModels(...args),
  fetchOpenRouterSpeechModels: (...args: unknown[]) => mockFetchOpenRouterSpeechModels(...args),
}));

vi.mock("@/lib/guardrails/presets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guardrails/presets")>("@/lib/guardrails/presets");
  return {
    ...actual,
    getPresetConfig: (...args: unknown[]) => mockGetPresetConfig(...args),
  };
});

import { useSettingsStore } from "./settings-store";
import { DEFAULT_GUARDRAILS_CONFIG } from "@/lib/guardrails/types";
import { YOLO_MODE_CONFIG, ADVANCED_MODE_CONFIG, NORMAL_MODE_CONFIG } from "@/lib/guardrails/presets";

function resetStore() {
  // Use partial setState (no replace flag) to preserve action functions
  useSettingsStore.setState({
    theme: "dark",
    hue: "neutral",
    homeDir: "",
    workingDirectory: "",
    settingsDirectory: "",
    userMode: "normal",
    yolo: false,
    sandboxed: true,
    guardrails: true,
    apiKeys: { anthropic: "", openai: "", google: "", openrouter: "" },
    localLLM: { enabled: false, provider: "lmstudio", baseUrl: "http://localhost:1234/v1", model: "" },
    defaultModel: "",
    availableModels: [],
    selectedModels: [],
    modelFetchStatus: "idle" as const,
    modelFetchError: null,
    modelEffort: {},
    imageModel: "",
    availableImageModels: [],
    imageModelFetchStatus: "idle" as const,
    imageModelFetchError: null,
    transcriptionModel: "",
    availableTranscriptionModels: [],
    transcriptionModelFetchStatus: "idle" as const,
    transcriptionModelFetchError: null,
    speechModel: "",
    speechVoice: "",
    availableSpeechModels: [],
    speechModelFetchStatus: "idle" as const,
    speechModelFetchError: null,
    guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
    agentDebugLogging: false,
  });
}

describe("settings-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  describe("initial state", () => {
    it("has dark theme", () => {
      expect(useSettingsStore.getState().theme).toBe("dark");
    });

    it("has empty API keys", () => {
      const { apiKeys } = useSettingsStore.getState();
      expect(apiKeys.anthropic).toBe("");
      expect(apiKeys.openai).toBe("");
      expect(apiKeys.google).toBe("");
      expect(apiKeys.openrouter).toBe("");
    });

    it("has no default model until one is selected", () => {
      expect(useSettingsStore.getState().defaultModel).toBe("");
    });

    it("has guardrails enabled", () => {
      expect(useSettingsStore.getState().guardrails).toBe(true);
    });

    it("has sandbox enabled", () => {
      expect(useSettingsStore.getState().sandboxed).toBe(true);
    });

    it("has yolo disabled", () => {
      expect(useSettingsStore.getState().yolo).toBe(false);
    });

    it("has normal user mode", () => {
      expect(useSettingsStore.getState().userMode).toBe("normal");
    });

    it("has debug logging disabled", () => {
      expect(useSettingsStore.getState().agentDebugLogging).toBe(false);
    });

    it("has idle model fetch status", () => {
      expect(useSettingsStore.getState().modelFetchStatus).toBe("idle");
    });

    it("has self-enhancement enabled by default", () => {
      expect(useSettingsStore.getState().allowSelfEnhancement).toBe(true);
    });
  });

  describe("partialize", () => {
    type Partialize = (state: unknown) => Record<string, unknown>;

    // partialize is an explicit allowlist — a field missing from it silently
    // fails to survive a restart.
    it("persists the per-model reasoning effort", () => {
      const partialize = persistCapture.options?.partialize as Partialize;
      useSettingsStore.getState().setModelEffort("m1", "high");
      expect(partialize(useSettingsStore.getState()).modelEffort).toEqual({ m1: "high" });
    });
  });

  describe("persist migration", () => {
    type Migrate = (state: unknown, version: number) => unknown;

    it("is versioned", () => {
      expect(persistCapture.options?.version).toBe(2);
    });

    it("v0 → v1 flips allowSelfEnhancement to true (old default was persisted, not chosen)", () => {
      const migrate = persistCapture.options?.migrate as Migrate;
      const migrated = migrate({ allowSelfEnhancement: false, theme: "dark" }, 0) as Record<
        string,
        unknown
      >;
      expect(migrated.allowSelfEnhancement).toBe(true);
      expect(migrated.theme).toBe("dark");
    });

    it("leaves a v1 opt-out of allowSelfEnhancement untouched", () => {
      const migrate = persistCapture.options?.migrate as Migrate;
      const migrated = migrate({ allowSelfEnhancement: false }, 1) as Record<string, unknown>;
      expect(migrated.allowSelfEnhancement).toBe(false);
    });

    it("v1 → v2 clears a defaultModel that is not in selectedModels", () => {
      const migrate = persistCapture.options?.migrate as Migrate;
      const migrated = migrate(
        { defaultModel: "claude-sonnet-4-20250514", selectedModels: [] },
        1
      ) as Record<string, unknown>;
      expect(migrated.defaultModel).toBe("");
    });

    it("v1 → v2 keeps a defaultModel the user actually selected", () => {
      const migrate = persistCapture.options?.migrate as Migrate;
      const migrated = migrate(
        {
          defaultModel: "m1",
          selectedModels: [{ id: "m1", name: "Model 1", provider: "anthropic" }],
        },
        1
      ) as Record<string, unknown>;
      expect(migrated.defaultModel).toBe("m1");
    });

    it("v1 → v2 keeps the local model as a default", () => {
      const migrate = persistCapture.options?.migrate as Migrate;
      const migrated = migrate({ defaultModel: "local", selectedModels: [] }, 1) as Record<
        string,
        unknown
      >;
      expect(migrated.defaultModel).toBe("local");
    });

    it("leaves v2 states untouched", () => {
      const migrate = persistCapture.options?.migrate as Migrate;
      const migrated = migrate({ defaultModel: "gone", selectedModels: [] }, 2) as Record<
        string,
        unknown
      >;
      expect(migrated.defaultModel).toBe("gone");
    });
  });

  describe("simple setters", () => {
    it("setTheme updates theme", () => {
      useSettingsStore.getState().setTheme("light");
      expect(useSettingsStore.getState().theme).toBe("light");
    });

    it("setHue updates hue", () => {
      useSettingsStore.getState().setHue("blue");
      expect(useSettingsStore.getState().hue).toBe("blue");
    });

    it("setHomeDir updates homeDir", () => {
      useSettingsStore.getState().setHomeDir("/home/user");
      expect(useSettingsStore.getState().homeDir).toBe("/home/user");
    });

    it("setWorkingDirectory updates workingDirectory", () => {
      useSettingsStore.getState().setWorkingDirectory("/projects");
      expect(useSettingsStore.getState().workingDirectory).toBe("/projects");
    });

    it("setSettingsDirectory updates settingsDirectory", () => {
      useSettingsStore.getState().setSettingsDirectory("/settings");
      expect(useSettingsStore.getState().settingsDirectory).toBe("/settings");
    });

    it("setUserMode updates userMode", () => {
      useSettingsStore.getState().setUserMode("advanced");
      expect(useSettingsStore.getState().userMode).toBe("advanced");
    });

    it("setDefaultModel updates defaultModel", () => {
      useSettingsStore.getState().setDefaultModel("gpt-4o");
      expect(useSettingsStore.getState().defaultModel).toBe("gpt-4o");
    });
  });

  describe("setYolo", () => {
    it("sets yolo flag", () => {
      useSettingsStore.getState().setYolo(true);
      expect(useSettingsStore.getState().yolo).toBe(true);
    });

    it("disables guardrails config when yolo enabled", () => {
      useSettingsStore.getState().setYolo(true);
      expect(useSettingsStore.getState().guardrailsConfig.enabled).toBe(false);
    });

    it("does not re-enable guardrails config when yolo disabled", () => {
      useSettingsStore.getState().setYolo(true);
      useSettingsStore.getState().setYolo(false);
      expect(useSettingsStore.getState().yolo).toBe(false);
      // guardrailsConfig.enabled stays false because setYolo(false) doesn't re-enable it
      expect(useSettingsStore.getState().guardrailsConfig.enabled).toBe(false);
    });
  });

  describe("setSandboxed", () => {
    it("sets sandboxed flag", () => {
      useSettingsStore.getState().setSandboxed(false);
      expect(useSettingsStore.getState().sandboxed).toBe(false);
    });

    it("syncs with guardrails sandbox config", () => {
      useSettingsStore.getState().setSandboxed(false);
      expect(useSettingsStore.getState().guardrailsConfig.sandbox.enabled).toBe(false);
    });
  });

  describe("setGuardrails", () => {
    it("sets guardrails flag", () => {
      useSettingsStore.getState().setGuardrails(false);
      expect(useSettingsStore.getState().guardrails).toBe(false);
    });

    it("syncs with guardrails config enabled", () => {
      useSettingsStore.getState().setGuardrails(false);
      expect(useSettingsStore.getState().guardrailsConfig.enabled).toBe(false);
    });
  });

  describe("setApiKey", () => {
    it("sets an API key", () => {
      useSettingsStore.getState().setApiKey("anthropic", "sk-test-123");
      expect(useSettingsStore.getState().apiKeys.anthropic).toBe("sk-test-123");
    });

    it("does not affect other provider keys", () => {
      useSettingsStore.getState().setApiKey("anthropic", "sk-test");
      expect(useSettingsStore.getState().apiKeys.openai).toBe("");
    });

    it("calls storeApiKey for keychain storage", () => {
      useSettingsStore.getState().setApiKey("openai", "sk-openai");
      expect(mockStoreApiKey).toHaveBeenCalledWith("openai", "sk-openai");
    });

    it("handles all providers", () => {
      const providers = ["anthropic", "openai", "google", "openrouter"] as const;
      for (const provider of providers) {
        useSettingsStore.getState().setApiKey(provider, `key-${provider}`);
        expect(useSettingsStore.getState().apiKeys[provider]).toBe(`key-${provider}`);
      }
    });
  });

  describe("setLocalLLM", () => {
    it("updates partial localLLM config", () => {
      useSettingsStore.getState().setLocalLLM({ enabled: true });
      const llm = useSettingsStore.getState().localLLM;
      expect(llm.enabled).toBe(true);
      expect(llm.provider).toBe("lmstudio"); // unchanged
    });

    it("updates multiple fields at once", () => {
      useSettingsStore.getState().setLocalLLM({ provider: "ollama", model: "llama3" });
      const llm = useSettingsStore.getState().localLLM;
      expect(llm.provider).toBe("ollama");
      expect(llm.model).toBe("llama3");
    });
  });

  describe("setAgentDebugLogging", () => {
    it("sets debug logging flag", () => {
      useSettingsStore.getState().setAgentDebugLogging(true);
      expect(useSettingsStore.getState().agentDebugLogging).toBe(true);
    });

    it("calls setLoggingEnabled", () => {
      useSettingsStore.getState().setAgentDebugLogging(true);
      expect(mockSetLoggingEnabled).toHaveBeenCalledWith(true);
    });
  });

  describe("model discovery", () => {
    it("setAvailableModels replaces available models", () => {
      const models = [{ id: "m1", name: "Model 1", provider: "anthropic" }];
      useSettingsStore.getState().setAvailableModels(models);
      expect(useSettingsStore.getState().availableModels).toEqual(models);
    });

    it("setSelectedModels replaces selected models", () => {
      const models = [{ id: "m1", name: "Model 1", provider: "anthropic" }];
      useSettingsStore.getState().setSelectedModels(models);
      expect(useSettingsStore.getState().selectedModels).toEqual(models);
    });

    it("addSelectedModels adds without duplicates", () => {
      const existing = { id: "m1", name: "Model 1", provider: "anthropic" };
      const newModel = { id: "m2", name: "Model 2", provider: "openai" };
      useSettingsStore.setState({ selectedModels: [existing] });
      useSettingsStore.getState().addSelectedModels([existing, newModel]);
      expect(useSettingsStore.getState().selectedModels).toHaveLength(2);
      expect(useSettingsStore.getState().selectedModels[1].id).toBe("m2");
    });

    it("removeSelectedModels removes by ID", () => {
      const models = [
        { id: "m1", name: "Model 1", provider: "anthropic" },
        { id: "m2", name: "Model 2", provider: "openai" },
      ];
      useSettingsStore.setState({ selectedModels: models, defaultModel: "m1" });
      useSettingsStore.getState().removeSelectedModels(["m1"]);
      expect(useSettingsStore.getState().selectedModels).toHaveLength(1);
      expect(useSettingsStore.getState().selectedModels[0].id).toBe("m2");
    });

    it("removeSelectedModels resets defaultModel if removed", () => {
      const models = [
        { id: "m1", name: "Model 1", provider: "anthropic" },
        { id: "m2", name: "Model 2", provider: "openai" },
      ];
      useSettingsStore.setState({ selectedModels: models, defaultModel: "m1" });
      useSettingsStore.getState().removeSelectedModels(["m1"]);
      expect(useSettingsStore.getState().defaultModel).toBe("m2");
    });

    it("removeSelectedModels clears defaultModel when all removed", () => {
      const models = [{ id: "m1", name: "Model 1", provider: "anthropic" }];
      useSettingsStore.setState({ selectedModels: models, defaultModel: "m1" });
      useSettingsStore.getState().removeSelectedModels(["m1"]);
      expect(useSettingsStore.getState().defaultModel).toBe("");
    });

    it("removeSelectedModels drops the effort preference of removed models", () => {
      const models = [
        { id: "m1", name: "Model 1", provider: "anthropic" },
        { id: "m2", name: "Model 2", provider: "openai" },
      ];
      useSettingsStore.setState({
        selectedModels: models,
        modelEffort: { m1: "high", m2: "low" },
      });
      useSettingsStore.getState().removeSelectedModels(["m1"]);
      expect(useSettingsStore.getState().modelEffort).toEqual({ m2: "low" });
    });
  });

  describe("modelEffort", () => {
    it("defaults to an empty map", () => {
      expect(useSettingsStore.getState().modelEffort).toEqual({});
    });

    it("setModelEffort stores a level per model id", () => {
      useSettingsStore.getState().setModelEffort("m1", "high");
      useSettingsStore.getState().setModelEffort("m2", "low");
      expect(useSettingsStore.getState().modelEffort).toEqual({ m1: "high", m2: "low" });
    });

    it("setModelEffort overwrites the level for the same model", () => {
      useSettingsStore.getState().setModelEffort("m1", "high");
      useSettingsStore.getState().setModelEffort("m1", "minimal");
      expect(useSettingsStore.getState().modelEffort).toEqual({ m1: "minimal" });
    });
  });

  describe("fetchModels", () => {
    it("sets fetching status", async () => {
      mockFetchAllProviderModels.mockResolvedValue([]);
      const promise = useSettingsStore.getState().fetchModels();
      expect(useSettingsStore.getState().modelFetchStatus).toBe("fetching");
      await promise;
    });

    it("sets done on successful fetch", async () => {
      mockFetchAllProviderModels.mockResolvedValue([
        { provider: "anthropic", models: [{ id: "m1", name: "M1", provider: "anthropic" }] },
      ]);
      await useSettingsStore.getState().fetchModels();
      expect(useSettingsStore.getState().modelFetchStatus).toBe("done");
      expect(useSettingsStore.getState().availableModels).toHaveLength(1);
    });

    it("sets error on failure", async () => {
      mockFetchAllProviderModels.mockRejectedValue(new Error("network error"));
      await useSettingsStore.getState().fetchModels();
      expect(useSettingsStore.getState().modelFetchStatus).toBe("error");
      expect(useSettingsStore.getState().modelFetchError).toBe("Error: network error");
    });

    it("sets done status when some providers have errors but also have models", async () => {
      mockFetchAllProviderModels.mockResolvedValue([
        { provider: "anthropic", models: [{ id: "m1", name: "M1", provider: "anthropic" }], error: "rate limited" },
      ]);
      await useSettingsStore.getState().fetchModels();
      expect(useSettingsStore.getState().modelFetchStatus).toBe("done");
      expect(useSettingsStore.getState().modelFetchError).toContain("rate limited");
    });

    it("backfills reasoning metadata onto already-selected models", async () => {
      // Selections are snapshots: entries chosen before discovery recorded
      // `reasoning` carry none, and Refresh is the only thing that re-syncs them.
      const reasoning = { mandatory: true, supported_efforts: ["high", "low"] };
      useSettingsStore.setState({
        selectedModels: [
          { id: "x-ai/grok-4.5", name: "Grok 4.5", provider: "openrouter" },
          { id: "gone/model", name: "Gone", provider: "openrouter", zdr: true },
        ],
      });
      mockFetchAllProviderModels.mockResolvedValue([
        {
          provider: "openrouter",
          models: [{ id: "x-ai/grok-4.5", name: "Grok 4.5", provider: "openrouter", reasoning }],
        },
      ]);

      await useSettingsStore.getState().fetchModels();
      const selected = useSettingsStore.getState().selectedModels;
      expect(selected[0]).toEqual({
        id: "x-ai/grok-4.5",
        name: "Grok 4.5",
        provider: "openrouter",
        reasoning,
      });
      // A model no longer offered keeps its entry untouched rather than vanishing.
      expect(selected[1]).toEqual({
        id: "gone/model",
        name: "Gone",
        provider: "openrouter",
        zdr: true,
      });
    });

    it("sets error status when all providers fail with no models", async () => {
      mockFetchAllProviderModels.mockResolvedValue([
        { provider: "anthropic", models: [], error: "auth failed" },
      ]);
      await useSettingsStore.getState().fetchModels();
      expect(useSettingsStore.getState().modelFetchStatus).toBe("error");
    });
  });

  describe("image model", () => {
    const imageModels = [
      { id: "openai/gpt-image-1", name: "GPT Image 1", supportsImageInput: true },
    ];

    it("defaults to disabled", () => {
      expect(useSettingsStore.getState().imageModel).toBe("");
      expect(useSettingsStore.getState().availableImageModels).toEqual([]);
      expect(useSettingsStore.getState().imageModelFetchStatus).toBe("idle");
    });

    it("setImageModel updates the selection", () => {
      useSettingsStore.getState().setImageModel("openai/gpt-image-1");
      expect(useSettingsStore.getState().imageModel).toBe("openai/gpt-image-1");
    });

    it("fetchImageModels stores models on success", async () => {
      mockFetchOpenRouterImageModels.mockResolvedValue({ models: imageModels });
      const promise = useSettingsStore.getState().fetchImageModels();
      expect(useSettingsStore.getState().imageModelFetchStatus).toBe("fetching");
      await promise;
      expect(useSettingsStore.getState().imageModelFetchStatus).toBe("done");
      expect(useSettingsStore.getState().availableImageModels).toEqual(imageModels);
    });

    it("fetchImageModels passes the OpenRouter key", async () => {
      useSettingsStore.setState({
        apiKeys: { anthropic: "", openai: "", google: "", openrouter: "sk-or-key" },
      });
      mockFetchOpenRouterImageModels.mockResolvedValue({ models: [] });
      await useSettingsStore.getState().fetchImageModels();
      expect(mockFetchOpenRouterImageModels).toHaveBeenCalledWith("sk-or-key");
    });

    it("fetchImageModels keeps the current list and selection on error", async () => {
      useSettingsStore.setState({
        availableImageModels: imageModels,
        imageModel: "openai/gpt-image-1",
      });
      mockFetchOpenRouterImageModels.mockResolvedValue({ models: [], error: "HTTP 401" });
      await useSettingsStore.getState().fetchImageModels();
      expect(useSettingsStore.getState().imageModelFetchStatus).toBe("error");
      expect(useSettingsStore.getState().imageModelFetchError).toBe("HTTP 401");
      expect(useSettingsStore.getState().availableImageModels).toEqual(imageModels);
      expect(useSettingsStore.getState().imageModel).toBe("openai/gpt-image-1");
    });
  });

  describe("transcription model", () => {
    const transcriptionModels = [{ id: "openai/whisper-large-v3", name: "Whisper Large V3" }];

    it("defaults to disabled", () => {
      expect(useSettingsStore.getState().transcriptionModel).toBe("");
      expect(useSettingsStore.getState().availableTranscriptionModels).toEqual([]);
      expect(useSettingsStore.getState().transcriptionModelFetchStatus).toBe("idle");
    });

    it("setTranscriptionModel updates the selection", () => {
      useSettingsStore.getState().setTranscriptionModel("openai/whisper-large-v3");
      expect(useSettingsStore.getState().transcriptionModel).toBe("openai/whisper-large-v3");
    });

    it("fetchTranscriptionModels stores models on success", async () => {
      mockFetchOpenRouterTranscriptionModels.mockResolvedValue({ models: transcriptionModels });
      const promise = useSettingsStore.getState().fetchTranscriptionModels();
      expect(useSettingsStore.getState().transcriptionModelFetchStatus).toBe("fetching");
      await promise;
      expect(useSettingsStore.getState().transcriptionModelFetchStatus).toBe("done");
      expect(useSettingsStore.getState().availableTranscriptionModels).toEqual(transcriptionModels);
    });

    it("fetchTranscriptionModels passes the OpenRouter key", async () => {
      useSettingsStore.setState({
        apiKeys: { anthropic: "", openai: "", google: "", openrouter: "sk-or-key" },
      });
      mockFetchOpenRouterTranscriptionModels.mockResolvedValue({ models: [] });
      await useSettingsStore.getState().fetchTranscriptionModels();
      expect(mockFetchOpenRouterTranscriptionModels).toHaveBeenCalledWith("sk-or-key");
    });

    it("fetchTranscriptionModels keeps the current list and selection on error", async () => {
      useSettingsStore.setState({
        availableTranscriptionModels: transcriptionModels,
        transcriptionModel: "openai/whisper-large-v3",
      });
      mockFetchOpenRouterTranscriptionModels.mockResolvedValue({ models: [], error: "HTTP 401" });
      await useSettingsStore.getState().fetchTranscriptionModels();
      expect(useSettingsStore.getState().transcriptionModelFetchStatus).toBe("error");
      expect(useSettingsStore.getState().transcriptionModelFetchError).toBe("HTTP 401");
      expect(useSettingsStore.getState().availableTranscriptionModels).toEqual(transcriptionModels);
      expect(useSettingsStore.getState().transcriptionModel).toBe("openai/whisper-large-v3");
    });
  });

  describe("speech model", () => {
    const speechModels = [
      { id: "x-ai/grok-voice-tts-1.0", name: "Grok Voice TTS", voices: ["eve", "ara"] },
      { id: "acme/voiceless-tts", name: "Voiceless TTS", voices: [] },
    ];

    it("defaults to disabled", () => {
      expect(useSettingsStore.getState().speechModel).toBe("");
      expect(useSettingsStore.getState().speechVoice).toBe("");
      expect(useSettingsStore.getState().availableSpeechModels).toEqual([]);
      expect(useSettingsStore.getState().speechModelFetchStatus).toBe("idle");
    });

    it("setSpeechModel selects the model and defaults to its first voice", () => {
      useSettingsStore.setState({ availableSpeechModels: speechModels });
      useSettingsStore.getState().setSpeechModel("x-ai/grok-voice-tts-1.0");
      expect(useSettingsStore.getState().speechModel).toBe("x-ai/grok-voice-tts-1.0");
      expect(useSettingsStore.getState().speechVoice).toBe("eve");
    });

    it("setSpeechModel clears the voice when the model has none", () => {
      useSettingsStore.setState({ availableSpeechModels: speechModels, speechVoice: "eve" });
      useSettingsStore.getState().setSpeechModel("acme/voiceless-tts");
      expect(useSettingsStore.getState().speechVoice).toBe("");
    });

    it("setSpeechModel clears the voice when the feature is disabled", () => {
      useSettingsStore.setState({ availableSpeechModels: speechModels, speechVoice: "eve" });
      useSettingsStore.getState().setSpeechModel("");
      expect(useSettingsStore.getState().speechModel).toBe("");
      expect(useSettingsStore.getState().speechVoice).toBe("");
    });

    it("setSpeechVoice updates the voice", () => {
      useSettingsStore.getState().setSpeechVoice("ara");
      expect(useSettingsStore.getState().speechVoice).toBe("ara");
    });

    it("fetchSpeechModels stores models on success", async () => {
      mockFetchOpenRouterSpeechModels.mockResolvedValue({ models: speechModels });
      const promise = useSettingsStore.getState().fetchSpeechModels();
      expect(useSettingsStore.getState().speechModelFetchStatus).toBe("fetching");
      await promise;
      expect(useSettingsStore.getState().speechModelFetchStatus).toBe("done");
      expect(useSettingsStore.getState().availableSpeechModels).toEqual(speechModels);
    });

    it("fetchSpeechModels passes the OpenRouter key", async () => {
      useSettingsStore.setState({
        apiKeys: { anthropic: "", openai: "", google: "", openrouter: "sk-or-key" },
      });
      mockFetchOpenRouterSpeechModels.mockResolvedValue({ models: [] });
      await useSettingsStore.getState().fetchSpeechModels();
      expect(mockFetchOpenRouterSpeechModels).toHaveBeenCalledWith("sk-or-key");
    });

    it("fetchSpeechModels keeps the current list and selection on error", async () => {
      useSettingsStore.setState({
        availableSpeechModels: speechModels,
        speechModel: "x-ai/grok-voice-tts-1.0",
        speechVoice: "ara",
      });
      mockFetchOpenRouterSpeechModels.mockResolvedValue({ models: [], error: "HTTP 401" });
      await useSettingsStore.getState().fetchSpeechModels();
      expect(useSettingsStore.getState().speechModelFetchStatus).toBe("error");
      expect(useSettingsStore.getState().speechModelFetchError).toBe("HTTP 401");
      expect(useSettingsStore.getState().availableSpeechModels).toEqual(speechModels);
      expect(useSettingsStore.getState().speechModel).toBe("x-ai/grok-voice-tts-1.0");
      expect(useSettingsStore.getState().speechVoice).toBe("ara");
    });
  });

  describe("guardrails config actions", () => {
    it("setGuardrailsConfig merges partial config", () => {
      useSettingsStore.getState().setGuardrailsConfig({ enabled: false });
      expect(useSettingsStore.getState().guardrailsConfig.enabled).toBe(false);
      expect(useSettingsStore.getState().guardrails).toBe(false);
    });

    it("setGuardrailsConfig syncs sandbox to sandboxed", () => {
      useSettingsStore.getState().setGuardrailsConfig({
        sandbox: { enabled: false, shellCommands: false, networkAccess: true, tempDirectory: "/tmp" },
      });
      expect(useSettingsStore.getState().sandboxed).toBe(false);
    });

    it("resetGuardrailsToDefaults restores all defaults", () => {
      useSettingsStore.setState({
        guardrailsConfig: { ...DEFAULT_GUARDRAILS_CONFIG, enabled: false },
        guardrails: false,
        sandboxed: false,
        yolo: true,
      });
      useSettingsStore.getState().resetGuardrailsToDefaults();
      expect(useSettingsStore.getState().guardrailsConfig).toEqual(DEFAULT_GUARDRAILS_CONFIG);
      expect(useSettingsStore.getState().guardrails).toBe(true);
      expect(useSettingsStore.getState().sandboxed).toBe(true);
      expect(useSettingsStore.getState().yolo).toBe(false);
    });

    it("applyGuardrailsPreset applies yolo preset", () => {
      mockGetPresetConfig.mockReturnValue(YOLO_MODE_CONFIG);
      useSettingsStore.getState().applyGuardrailsPreset("yolo");
      expect(useSettingsStore.getState().yolo).toBe(true);
      expect(useSettingsStore.getState().guardrailsConfig).toEqual(YOLO_MODE_CONFIG);
      expect(useSettingsStore.getState().userMode).toBe("advanced");
    });

    it("applyGuardrailsPreset applies normal preset", () => {
      mockGetPresetConfig.mockReturnValue(NORMAL_MODE_CONFIG);
      useSettingsStore.getState().applyGuardrailsPreset("normal");
      expect(useSettingsStore.getState().yolo).toBe(false);
      expect(useSettingsStore.getState().userMode).toBe("normal");
    });

    it("applyGuardrailsPreset applies advanced preset", () => {
      mockGetPresetConfig.mockReturnValue(ADVANCED_MODE_CONFIG);
      useSettingsStore.getState().applyGuardrailsPreset("advanced");
      expect(useSettingsStore.getState().yolo).toBe(false);
      expect(useSettingsStore.getState().userMode).toBe("advanced");
    });
  });

  describe("importGuardrailsConfig", () => {
    it("imports valid JSON config", () => {
      const config = {
        ...DEFAULT_GUARDRAILS_CONFIG,
        enabled: false,
      };
      const result = useSettingsStore.getState().importGuardrailsConfig(JSON.stringify(config));
      expect(result).toBe(true);
      expect(useSettingsStore.getState().guardrailsConfig.enabled).toBe(false);
    });

    it("returns false for invalid JSON", () => {
      const result = useSettingsStore.getState().importGuardrailsConfig("not json");
      expect(result).toBe(false);
    });

    it("returns false when enabled is not boolean", () => {
      const result = useSettingsStore.getState().importGuardrailsConfig(
        JSON.stringify({ enabled: "yes", categoryConfirmation: {} })
      );
      expect(result).toBe(false);
    });

    it("returns false when categoryConfirmation is missing", () => {
      const result = useSettingsStore.getState().importGuardrailsConfig(
        JSON.stringify({ enabled: true })
      );
      expect(result).toBe(false);
    });

    it("syncs yolo flag based on enabled", () => {
      const config = { ...DEFAULT_GUARDRAILS_CONFIG, enabled: false };
      useSettingsStore.getState().importGuardrailsConfig(JSON.stringify(config));
      expect(useSettingsStore.getState().yolo).toBe(true);
    });
  });

  describe("exportGuardrailsConfig", () => {
    it("exports current config as JSON string", () => {
      const json = useSettingsStore.getState().exportGuardrailsConfig();
      const parsed = JSON.parse(json);
      expect(parsed.enabled).toBe(true);
      expect(parsed.categoryConfirmation).toBeDefined();
    });

    it("roundtrips with import", () => {
      const exported = useSettingsStore.getState().exportGuardrailsConfig();
      resetStore();
      const result = useSettingsStore.getState().importGuardrailsConfig(exported);
      expect(result).toBe(true);
    });
  });
});
