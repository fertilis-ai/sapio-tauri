import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LOCAL_MODEL_ID, type ChatModelId, type ImageProviderModel, type ProviderModel, type SpeechProviderModel, type TranscriptionProviderModel } from "@/lib/models";
import { fetchAllProviderModels, fetchOpenRouterImageModels, fetchOpenRouterSpeechModels, fetchOpenRouterTranscriptionModels } from "@/lib/provider-models";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { DEFAULT_GUARDRAILS_CONFIG } from "@/lib/guardrails/types";
import { getPresetConfig, type UserModePreset } from "@/lib/guardrails/presets";
import { setLoggingEnabled } from "@/lib/logger";
import { storeApiKey } from "@/lib/keychain";
import { isTauri } from "@tauri-apps/api/core";
import type { HueId } from "@/lib/hue-presets";
import type { EffortLevel } from "@/lib/reasoning";

export type Theme = "system" | "light" | "dark";
export type UserMode = "normal" | "advanced";
export type LocalLlmProvider = "lmstudio" | "ollama";

interface SettingsState {
  theme: Theme;
  hue: HueId;
  homeDir: string;
  workingDirectory: string;
  settingsDirectory: string;
  userMode: UserMode;
  yolo: boolean;
  sandboxed: boolean;
  guardrails: boolean;
  apiKeys: {
    anthropic: string;
    openai: string;
    google: string;
    openrouter: string;
  };
  localLLM: {
    enabled: boolean;
    provider: LocalLlmProvider;
    baseUrl: string;
    model: string;
  };
  defaultModel: ChatModelId;
  // Last-selected chat agent (by name); persisted so selection survives restart.
  selectedAgentId: string | null;

  // Model discovery
  availableModels: ProviderModel[];
  selectedModels: ProviderModel[];
  modelFetchStatus: "idle" | "fetching" | "done" | "error";
  modelFetchError: string | null;
  // When true, hide OpenRouter models without a zero-data-retention endpoint.
  modelDiscoveryNoDataCollection: boolean;
  // Reasoning effort per model id. Only reasoning-capable models get an entry;
  // every read is clamped to what the model supports, so stale values are safe.
  modelEffort: Record<string, EffortLevel>;

  // Image generation (OpenRouter). Empty imageModel = feature disabled.
  imageModel: string;
  availableImageModels: ImageProviderModel[];
  imageModelFetchStatus: "idle" | "fetching" | "done" | "error";
  imageModelFetchError: string | null;

  // Voice transcription (OpenRouter). Empty transcriptionModel = feature disabled.
  transcriptionModel: string;
  availableTranscriptionModels: TranscriptionProviderModel[];
  transcriptionModelFetchStatus: "idle" | "fetching" | "done" | "error";
  transcriptionModelFetchError: string | null;

  // Text-to-speech (OpenRouter). Empty speechModel = feature disabled.
  speechModel: string;
  speechVoice: string;
  availableSpeechModels: SpeechProviderModel[];
  speechModelFetchStatus: "idle" | "fetching" | "done" | "error";
  speechModelFetchError: string | null;

  // Enhanced guardrails configuration
  guardrailsConfig: GuardrailsConfig;

  // Debug settings
  agentDebugLogging: boolean;

  // Self-enhancement: allow the agent to author/edit its own Toolbox files
  // (prompts, memories, agents, skills, workflows). Off by default given the
  // autonomy implications.
  allowSelfEnhancement: boolean;

  setTheme: (theme: Theme) => void;
  setHue: (hue: HueId) => void;
  setHomeDir: (dir: string) => void;
  setWorkingDirectory: (dir: string) => void;
  setSettingsDirectory: (dir: string) => void;
  setUserMode: (mode: UserMode) => void;
  setYolo: (yolo: boolean) => void;
  setSandboxed: (sandboxed: boolean) => void;
  setGuardrails: (guardrails: boolean) => void;
  setApiKey: (provider: "anthropic" | "openai" | "google" | "openrouter", key: string) => void;
  setLocalLLM: (updates: Partial<SettingsState["localLLM"]>) => void;
  setDefaultModel: (model: ChatModelId) => void;
  setModelEffort: (modelId: string, effort: EffortLevel) => void;
  setSelectedAgentId: (agentId: string | null) => void;
  setAgentDebugLogging: (enabled: boolean) => void;
  setAllowSelfEnhancement: (enabled: boolean) => void;

  // Model discovery actions
  setAvailableModels: (models: ProviderModel[]) => void;
  setSelectedModels: (models: ProviderModel[]) => void;
  addSelectedModels: (models: ProviderModel[]) => void;
  removeSelectedModels: (modelIds: string[]) => void;
  fetchModels: () => Promise<void>;
  setModelDiscoveryNoDataCollection: (enabled: boolean) => void;

  // Image generation actions
  setImageModel: (modelId: string) => void;
  setAvailableImageModels: (models: ImageProviderModel[]) => void;
  fetchImageModels: () => Promise<void>;

  // Voice transcription actions
  setTranscriptionModel: (modelId: string) => void;
  setAvailableTranscriptionModels: (models: TranscriptionProviderModel[]) => void;
  fetchTranscriptionModels: () => Promise<void>;

  // Text-to-speech actions
  setSpeechModel: (modelId: string) => void;
  setSpeechVoice: (voice: string) => void;
  setAvailableSpeechModels: (models: SpeechProviderModel[]) => void;
  fetchSpeechModels: () => Promise<void>;

  // Guardrails config actions
  setGuardrailsConfig: (config: Partial<GuardrailsConfig>) => void;
  resetGuardrailsToDefaults: () => void;
  applyGuardrailsPreset: (preset: UserModePreset) => void;
  importGuardrailsConfig: (json: string) => boolean;
  exportGuardrailsConfig: () => string;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      hue: "neutral",
      homeDir: "",
      workingDirectory: "",
      settingsDirectory: "",
      userMode: "normal",
      yolo: false,
      sandboxed: true,
      guardrails: true,
      apiKeys: {
        anthropic: "",
        openai: "",
        google: "",
        openrouter: "",
      },
      localLLM: {
        enabled: false,
        provider: "lmstudio",
        baseUrl: "http://localhost:1234/v1",
        model: "",
      },
      // No model until the user discovers and selects one — see getActiveModels.
      defaultModel: "",
      selectedAgentId: null,
      availableModels: [],
      selectedModels: [],
      modelFetchStatus: "idle" as const,
      modelFetchError: null,
      modelDiscoveryNoDataCollection: false,
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
      allowSelfEnhancement: true,

      setTheme: (theme) => set({ theme }),
      setHue: (hue) => set({ hue }),
      setHomeDir: (homeDir) => set({ homeDir }),
      setWorkingDirectory: (workingDirectory) => set({ workingDirectory }),
      setSettingsDirectory: (settingsDirectory) => set({ settingsDirectory }),
      setUserMode: (userMode) => set({ userMode }),
      setYolo: (yolo) => {
        set({ yolo });
        // Sync with guardrails config
        if (yolo) {
          set((state) => ({
            guardrailsConfig: { ...state.guardrailsConfig, enabled: false },
          }));
        }
      },
      setSandboxed: (sandboxed) => {
        set({ sandboxed });
        // Sync with guardrails config
        set((state) => ({
          guardrailsConfig: {
            ...state.guardrailsConfig,
            sandbox: { ...state.guardrailsConfig.sandbox, enabled: sandboxed },
          },
        }));
      },
      setGuardrails: (guardrails) => {
        set({ guardrails });
        // Sync with guardrails config
        set((state) => ({
          guardrailsConfig: { ...state.guardrailsConfig, enabled: guardrails },
        }));
      },
      setApiKey: (provider, key) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        }));
        storeApiKey(provider, key).catch((err) => {
          console.warn("[settings] Failed to store key in keychain:", err);
        });
      },
      setLocalLLM: (updates) =>
        set((state) => ({
          localLLM: { ...state.localLLM, ...updates },
        })),
      setDefaultModel: (defaultModel) => set({ defaultModel }),
      setModelEffort: (modelId, effort) =>
        set((state) => ({ modelEffort: { ...state.modelEffort, [modelId]: effort } })),
      setSelectedAgentId: (selectedAgentId) => set({ selectedAgentId }),
      setAgentDebugLogging: (agentDebugLogging) => {
        set({ agentDebugLogging });
        setLoggingEnabled(agentDebugLogging);
      },
      setAllowSelfEnhancement: (allowSelfEnhancement) => set({ allowSelfEnhancement }),

      // Model discovery actions
      setAvailableModels: (availableModels) => set({ availableModels }),
      setSelectedModels: (selectedModels) => set({ selectedModels }),
      addSelectedModels: (models) =>
        set((state) => {
          const existingIds = new Set(state.selectedModels.map((m) => m.id));
          const newModels = models.filter((m) => !existingIds.has(m.id));
          return { selectedModels: [...state.selectedModels, ...newModels] };
        }),
      removeSelectedModels: (modelIds) =>
        set((state) => {
          const removeSet = new Set(modelIds);
          const remaining = state.selectedModels.filter((m) => !removeSet.has(m.id));
          // If the default model is being removed, reset to first remaining, or
          // to none when the selection is now empty
          const defaultModel =
            removeSet.has(state.defaultModel) ? (remaining[0]?.id ?? "") : state.defaultModel;
          // Drop the effort preference along with the model it belonged to.
          const modelEffort = Object.fromEntries(
            Object.entries(state.modelEffort).filter(([id]) => !removeSet.has(id))
          );
          return { selectedModels: remaining, defaultModel, modelEffort };
        }),
      fetchModels: async () => {
        set({ modelFetchStatus: "fetching", modelFetchError: null });
        try {
          const results = await fetchAllProviderModels(get().apiKeys);
          const allModels: ProviderModel[] = [];
          const errors: string[] = [];
          for (const r of results) {
            allModels.push(...r.models);
            if (r.error) errors.push(`${r.provider}: ${r.error}`);
          }
          set((state) => ({
            availableModels: allModels,
            // Selected models are snapshots taken when they were added, so entries
            // chosen before reasoning metadata existed carry none. Refresh re-syncs
            // them in place — without it the effort picker keeps falling back to
            // pi-ai's registry for models the user selected long ago.
            selectedModels: state.selectedModels.map((s) => {
              const fresh = allModels.find((m) => m.id === s.id && m.provider === s.provider);
              return fresh ? { ...s, reasoning: fresh.reasoning } : s;
            }),
            modelFetchStatus: errors.length > 0 && allModels.length === 0 ? "error" : "done",
            modelFetchError: errors.length > 0 ? errors.join("; ") : null,
          }));
        } catch (e) {
          set({ modelFetchStatus: "error", modelFetchError: String(e) });
        }
      },
      setModelDiscoveryNoDataCollection: (modelDiscoveryNoDataCollection) =>
        set({ modelDiscoveryNoDataCollection }),

      // Image generation actions
      setImageModel: (imageModel) => set({ imageModel }),
      setAvailableImageModels: (availableImageModels) => set({ availableImageModels }),
      fetchImageModels: async () => {
        set({ imageModelFetchStatus: "fetching", imageModelFetchError: null });
        try {
          const { models, error } = await fetchOpenRouterImageModels(get().apiKeys.openrouter);
          set({
            // Keep the current list on a failed fetch; the user's imageModel
            // selection is never touched here (their choice wins).
            ...(models.length > 0 || !error ? { availableImageModels: models } : {}),
            imageModelFetchStatus: error && models.length === 0 ? "error" : "done",
            imageModelFetchError: error ?? null,
          });
        } catch (e) {
          set({ imageModelFetchStatus: "error", imageModelFetchError: String(e) });
        }
      },

      // Voice transcription actions
      setTranscriptionModel: (transcriptionModel) => set({ transcriptionModel }),
      setAvailableTranscriptionModels: (availableTranscriptionModels) =>
        set({ availableTranscriptionModels }),
      fetchTranscriptionModels: async () => {
        set({ transcriptionModelFetchStatus: "fetching", transcriptionModelFetchError: null });
        try {
          const { models, error } = await fetchOpenRouterTranscriptionModels(
            get().apiKeys.openrouter
          );
          set({
            // Keep the current list on a failed fetch; the user's transcriptionModel
            // selection is never touched here (their choice wins).
            ...(models.length > 0 || !error ? { availableTranscriptionModels: models } : {}),
            transcriptionModelFetchStatus: error && models.length === 0 ? "error" : "done",
            transcriptionModelFetchError: error ?? null,
          });
        } catch (e) {
          set({
            transcriptionModelFetchStatus: "error",
            transcriptionModelFetchError: String(e),
          });
        }
      },

      // Text-to-speech actions
      setSpeechModel: (speechModel) =>
        set({
          speechModel,
          // Changing models invalidates the voice; default to the new model's first voice.
          speechVoice:
            get().availableSpeechModels.find((m) => m.id === speechModel)?.voices[0] ?? "",
        }),
      setSpeechVoice: (speechVoice) => set({ speechVoice }),
      setAvailableSpeechModels: (availableSpeechModels) => set({ availableSpeechModels }),
      fetchSpeechModels: async () => {
        set({ speechModelFetchStatus: "fetching", speechModelFetchError: null });
        try {
          const { models, error } = await fetchOpenRouterSpeechModels(get().apiKeys.openrouter);
          set({
            // Keep the current list on a failed fetch; the user's speechModel
            // selection is never touched here (their choice wins).
            ...(models.length > 0 || !error ? { availableSpeechModels: models } : {}),
            speechModelFetchStatus: error && models.length === 0 ? "error" : "done",
            speechModelFetchError: error ?? null,
          });
        } catch (e) {
          set({ speechModelFetchStatus: "error", speechModelFetchError: String(e) });
        }
      },

      // Guardrails config actions
      setGuardrailsConfig: (config) =>
        set((state) => ({
          guardrailsConfig: { ...state.guardrailsConfig, ...config },
          // Keep legacy fields in sync
          guardrails: config.enabled ?? state.guardrailsConfig.enabled,
          sandboxed: config.sandbox?.enabled ?? state.guardrailsConfig.sandbox.enabled,
        })),

      resetGuardrailsToDefaults: () =>
        set({
          guardrailsConfig: DEFAULT_GUARDRAILS_CONFIG,
          guardrails: DEFAULT_GUARDRAILS_CONFIG.enabled,
          sandboxed: DEFAULT_GUARDRAILS_CONFIG.sandbox.enabled,
          yolo: false,
        }),

      applyGuardrailsPreset: (preset) => {
        const presetConfig = getPresetConfig(preset);
        set({
          guardrailsConfig: presetConfig,
          guardrails: presetConfig.enabled,
          sandboxed: presetConfig.sandbox.enabled,
          yolo: preset === "yolo",
          userMode: preset === "normal" ? "normal" : "advanced",
        });
      },

      importGuardrailsConfig: (json) => {
        try {
          const config = JSON.parse(json) as GuardrailsConfig;
          // Basic validation
          if (typeof config.enabled !== "boolean") return false;
          if (!config.categoryConfirmation) return false;

          set({
            guardrailsConfig: { ...DEFAULT_GUARDRAILS_CONFIG, ...config },
            guardrails: config.enabled,
            sandboxed: config.sandbox?.enabled ?? true,
            yolo: !config.enabled,
          });
          return true;
        } catch {
          return false;
        }
      },

      exportGuardrailsConfig: () => {
        return JSON.stringify(get().guardrailsConfig, null, 2);
      },
    }),
    {
      name: "verbalis-settings",
      version: 2,
      // v0 → v1: allowSelfEnhancement's default flipped to true. The old
      // default (false) was persisted on every save whether or not the user
      // ever touched the toggle, so a stored false can't be read as a choice —
      // flip it once; opting out again survives (v1 states are never migrated).
      //
      // v1 → v2: defaultModel used to be seeded with DEFAULT_MODEL_ID and
      // getActiveModels fell back to the MODEL_OPTIONS catalog, so a stored
      // default that isn't in selectedModels was never actually chosen. Clear
      // it rather than leave a model id that no longer resolves to anything.
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState;
        const state = persistedState as {
          allowSelfEnhancement?: boolean;
          defaultModel?: string;
          selectedModels?: ProviderModel[];
        };
        if (version === 0) state.allowSelfEnhancement = true;
        if (version < 2 && state.defaultModel !== LOCAL_MODEL_ID) {
          const selected = state.selectedModels ?? [];
          if (!selected.some((m) => m.id === state.defaultModel)) state.defaultModel = "";
        }
        return persistedState;
      },
      partialize: (state) => ({
        theme: state.theme,
        hue: state.hue,
        workingDirectory: state.workingDirectory,
        settingsDirectory: state.settingsDirectory,
        userMode: state.userMode,
        // In Tauri mode, apiKeys are stored in the OS keychain — not localStorage
        ...(isTauri() ? {} : { apiKeys: state.apiKeys }),
        localLLM: state.localLLM,
        defaultModel: state.defaultModel,
        selectedAgentId: state.selectedAgentId,
        availableModels: state.availableModels,
        selectedModels: state.selectedModels,
        modelDiscoveryNoDataCollection: state.modelDiscoveryNoDataCollection,
        modelEffort: state.modelEffort,
        imageModel: state.imageModel,
        availableImageModels: state.availableImageModels,
        transcriptionModel: state.transcriptionModel,
        availableTranscriptionModels: state.availableTranscriptionModels,
        speechModel: state.speechModel,
        speechVoice: state.speechVoice,
        availableSpeechModels: state.availableSpeechModels,
        guardrailsConfig: state.guardrailsConfig,
        agentDebugLogging: state.agentDebugLogging,
        allowSelfEnhancement: state.allowSelfEnhancement,
      }),
      onRehydrateStorage: () => (state) => {
        // Sync the logging enabled state when the store is rehydrated from localStorage
        if (state) {
          setLoggingEnabled(state.agentDebugLogging);
        }
      },
    }
  )
);
