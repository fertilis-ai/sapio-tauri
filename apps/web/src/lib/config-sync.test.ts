import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import YAML from "yaml";

// Mock storage
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockPathExists = vi.fn();
const mockGetAppDataDir = vi.fn();
const mockIsTauri = vi.fn();

vi.mock("@/lib/storage", () => ({
  isTauri: (...args: unknown[]) => mockIsTauri(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  pathExists: (...args: unknown[]) => mockPathExists(...args),
  getAppDataDir: (...args: unknown[]) => mockGetAppDataDir(...args),
}));

// Mock keychain
const mockLoadAllApiKeys = vi.fn();
const mockStoreApiKey = vi.fn();

vi.mock("@/lib/keychain", () => ({
  loadAllApiKeys: (...args: unknown[]) => mockLoadAllApiKeys(...args),
  storeApiKey: (...args: unknown[]) => mockStoreApiKey(...args),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  setLoggingEnabled: vi.fn(),
}));

// Build a mock settings store
const mockSetTheme = vi.fn();
const mockSetHue = vi.fn();
const mockSetWorkingDirectory = vi.fn();
const mockSetSettingsDirectory = vi.fn();
const mockSetUserMode = vi.fn();
const mockSetLocalLLM = vi.fn();
const mockSetDefaultModel = vi.fn();
const mockSetAvailableModels = vi.fn();
const mockSetSelectedModels = vi.fn();
const mockSetImageModel = vi.fn();
const mockSetAvailableImageModels = vi.fn();
const mockSetGuardrailsConfig = vi.fn();
const mockSetGuardrails = vi.fn();
const mockSetSandboxed = vi.fn();
const mockSetYolo = vi.fn();
const mockSetAgentDebugLogging = vi.fn();
const mockSetState = vi.fn();

const defaultStoreState = {
  theme: "system" as const,
  hue: "zinc" as const,
  workingDirectory: "/home/user",
  settingsDirectory: "/home/user/.verbalis",
  userMode: "normal" as const,
  localLLM: { enabled: false, provider: "ollama" as const, baseUrl: "http://localhost:11434", model: "" },
  defaultModel: "claude-sonnet-4-20250514",
  availableModels: [],
  selectedModels: [],
  modelEffort: {} as Record<string, string>,
  imageModel: "",
  availableImageModels: [],
  guardrailsConfig: { enabled: true, sandbox: { enabled: false } },
  agentDebugLogging: false,
  apiKeys: { anthropic: "", openai: "", google: "", openrouter: "" },
  setTheme: mockSetTheme,
  setHue: mockSetHue,
  setWorkingDirectory: mockSetWorkingDirectory,
  setSettingsDirectory: mockSetSettingsDirectory,
  setUserMode: mockSetUserMode,
  setLocalLLM: mockSetLocalLLM,
  setDefaultModel: mockSetDefaultModel,
  setAvailableModels: mockSetAvailableModels,
  setSelectedModels: mockSetSelectedModels,
  setImageModel: mockSetImageModel,
  setAvailableImageModels: mockSetAvailableImageModels,
  setGuardrailsConfig: mockSetGuardrailsConfig,
  setGuardrails: mockSetGuardrails,
  setSandboxed: mockSetSandboxed,
  setYolo: mockSetYolo,
  setAgentDebugLogging: mockSetAgentDebugLogging,
};

let subscribeCallback: (() => void) | null = null;

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({ ...defaultStoreState })),
    subscribe: vi.fn((cb: () => void) => {
      subscribeCallback = cb;
      return () => { subscribeCallback = null; };
    }),
    setState: (...args: unknown[]) => mockSetState(...args),
  },
}));

import { initConfigSync, stopConfigSync } from "./config-sync";

describe("config-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    subscribeCallback = null;
    mockGetAppDataDir.mockResolvedValue("/home/user/.verbalis");
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue("");
    mockPathExists.mockResolvedValue(false);
    mockLoadAllApiKeys.mockResolvedValue({});
    mockStoreApiKey.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopConfigSync();
    vi.useRealTimers();
  });

  describe("initConfigSync", () => {
    it("is a no-op when not in Tauri", async () => {
      mockIsTauri.mockReturnValue(false);
      await initConfigSync();

      expect(mockGetAppDataDir).not.toHaveBeenCalled();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("writes initial config when no config.yaml exists", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(false);

      await initConfigSync();

      // Should have written config.yaml since the file didn't exist
      expect(mockWriteFile).toHaveBeenCalled();
      const writtenPath = mockWriteFile.mock.calls[0][0] as string;
      expect(writtenPath).toBe("/home/user/.verbalis/config.yaml");
    });

    it("loads existing config.yaml into the store", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);

      const existingConfig = {
        theme: "dark",
        hue: "blue",
        workingDirectory: "/custom/dir",
        userMode: "advanced",
      };
      mockReadFile.mockResolvedValue(YAML.stringify(existingConfig));

      await initConfigSync();

      expect(mockSetTheme).toHaveBeenCalledWith("dark");
      expect(mockSetHue).toHaveBeenCalledWith("blue");
      expect(mockSetWorkingDirectory).toHaveBeenCalledWith("/custom/dir");
      expect(mockSetUserMode).toHaveBeenCalledWith("advanced");
    });

    it("loads image model settings into the store", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);

      const imageModels = [{ id: "openai/gpt-image-1", name: "GPT Image 1", supportsImageInput: true }];
      mockReadFile.mockResolvedValue(
        YAML.stringify({ imageModel: "openai/gpt-image-1", availableImageModels: imageModels })
      );

      await initConfigSync();

      expect(mockSetImageModel).toHaveBeenCalledWith("openai/gpt-image-1");
      expect(mockSetAvailableImageModels).toHaveBeenCalledWith(imageModels);
    });

    it("persists image model settings when writing config", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(false);

      await initConfigSync();

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      const parsed = YAML.parse(writtenContent);
      expect(parsed.imageModel).toBe("");
      expect(parsed.availableImageModels).toEqual([]);
    });

    // The effort picker's choice is worthless if it does not survive a restart, and
    // config.yaml — not localStorage — is the desktop source of truth every other
    // model setting round-trips through.
    it("persists per-model reasoning effort when writing config", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(false);
      defaultStoreState.modelEffort = { "x-ai/grok-4.5": "low" };

      await initConfigSync();

      const parsed = YAML.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(parsed.modelEffort).toEqual({ "x-ai/grok-4.5": "low" });
      defaultStoreState.modelEffort = {};
    });

    it("loads per-model reasoning effort into the store", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        YAML.stringify({ modelEffort: { "google/gemini-3.6-flash": "high" } })
      );

      await initConfigSync();

      expect(mockSetState).toHaveBeenCalledWith({
        modelEffort: { "google/gemini-3.6-flash": "high" },
      });
    });

    it("loads guardrails config and syncs legacy fields", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);

      const existingConfig = {
        guardrailsConfig: { enabled: false, sandbox: { enabled: true } },
      };
      mockReadFile.mockResolvedValue(YAML.stringify(existingConfig));

      await initConfigSync();

      expect(mockSetGuardrailsConfig).toHaveBeenCalledWith(existingConfig.guardrailsConfig);
      expect(mockSetGuardrails).toHaveBeenCalledWith(false);
      expect(mockSetSandboxed).toHaveBeenCalledWith(true);
      expect(mockSetYolo).toHaveBeenCalledWith(true); // yolo = !enabled
    });

    it("loads API keys from keychain", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(YAML.stringify({ theme: "light" }));
      mockLoadAllApiKeys.mockResolvedValue({ anthropic: "sk-ant-123", openai: "sk-oai-456" });

      await initConfigSync();

      expect(mockSetState).toHaveBeenCalled();
    });

    it("migrates apiKeys from config.yaml to keychain", async () => {
      mockIsTauri.mockReturnValue(true);
      // First call: loadConfigFromFile checks pathExists
      // Second call: migrateApiKeysToKeychain checks pathExists
      mockPathExists.mockResolvedValue(true);

      const configWithKeys = {
        theme: "light",
        apiKeys: { anthropic: "sk-ant-old", openai: "sk-oai-old" },
      };
      mockReadFile.mockResolvedValue(YAML.stringify(configWithKeys));

      await initConfigSync();

      expect(mockStoreApiKey).toHaveBeenCalledWith("anthropic", "sk-ant-old");
      expect(mockStoreApiKey).toHaveBeenCalledWith("openai", "sk-oai-old");
      // After migration, apiKeys should be stripped from config.yaml and rewritten
      const lastWriteCall = mockWriteFile.mock.calls[mockWriteFile.mock.calls.length - 1];
      const writtenContent = lastWriteCall[1] as string;
      const parsed = YAML.parse(writtenContent);
      expect(parsed.apiKeys).toBeUndefined();
    });

    it("subscribes to store changes after loading", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(false);

      const { useSettingsStore } = await import("@/stores/settings-store");
      await initConfigSync();

      expect(useSettingsStore.subscribe).toHaveBeenCalled();
    });
  });

  describe("debounced writing", () => {
    it("writes config after debounce when store changes", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(false);

      await initConfigSync();

      // Clear the initial write calls
      mockWriteFile.mockClear();

      // Trigger store subscription callback
      if (subscribeCallback) subscribeCallback();

      // Should not write immediately
      expect(mockWriteFile).not.toHaveBeenCalled();

      // Advance past debounce timer (500ms)
      await vi.advanceTimersByTimeAsync(600);

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it("debounces multiple rapid changes", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(false);

      await initConfigSync();
      mockWriteFile.mockClear();

      // Trigger multiple rapid changes
      if (subscribeCallback) {
        subscribeCallback();
        subscribeCallback();
        subscribeCallback();
      }

      await vi.advanceTimersByTimeAsync(600);

      // Should only write once despite 3 triggers
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("stopConfigSync", () => {
    it("cleans up subscription and timers", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(false);

      await initConfigSync();
      mockWriteFile.mockClear();

      stopConfigSync();

      // Trigger what was the subscription callback
      if (subscribeCallback) subscribeCallback();
      await vi.advanceTimersByTimeAsync(600);

      // Should not write since we stopped
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  describe("loadConfigFromFile edge cases", () => {
    it("handles invalid YAML gracefully", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue("invalid: yaml: [broken");

      // Should not throw
      await initConfigSync();
    });

    it("handles null parsed YAML", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue("");

      // Should not throw
      await initConfigSync();
    });

    it("only patches fields that exist in the file", async () => {
      mockIsTauri.mockReturnValue(true);
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(YAML.stringify({ theme: "dark" }));

      await initConfigSync();

      expect(mockSetTheme).toHaveBeenCalledWith("dark");
      // Other setters should NOT have been called since they weren't in the file
      expect(mockSetWorkingDirectory).not.toHaveBeenCalled();
      expect(mockSetUserMode).not.toHaveBeenCalled();
    });
  });
});
