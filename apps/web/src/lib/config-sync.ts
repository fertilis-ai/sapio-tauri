/**
 * Config Sync
 *
 * Subscribes to the Zustand settings store and writes changes to ~/.verbalis/config.yaml (debounced).
 * On startup, loads from config.yaml to hydrate the store.
 * In browser mode, this module is a no-op.
 */

import YAML from "yaml";
import { isTauri, readFile, writeFile, pathExists, getAppDataDir } from "@/lib/storage";
import { useSettingsStore } from "@/stores/settings-store";
import { loadAllApiKeys } from "@/lib/keychain";
import { setLoggingEnabled } from "@/lib/logger";
import type { HueId } from "@/lib/hue-presets";
import type { ChatModelId, ImageProviderModel, ProviderModel } from "@/lib/models";
import type { EffortLevel } from "@/lib/reasoning";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import type { UserMode, Theme, LocalLlmProvider } from "@/stores/settings-store";

/** The subset of settings state persisted to config.yaml */
interface ConfigYaml {
  theme: Theme;
  hue: HueId;
  workingDirectory: string;
  settingsDirectory: string;
  userMode: UserMode;
  localLLM: {
    enabled: boolean;
    provider: LocalLlmProvider;
    baseUrl: string;
    model: string;
  };
  defaultModel: ChatModelId;
  availableModels: ProviderModel[];
  selectedModels: ProviderModel[];
  /** Per-model reasoning effort, keyed by model id. Sparse — only models the user has set. */
  modelEffort: Record<string, EffortLevel>;
  imageModel: string;
  availableImageModels: ImageProviderModel[];
  guardrailsConfig: GuardrailsConfig;
  agentDebugLogging: boolean;
}

/** Pick persistable fields from the store */
function extractConfigFromStore(): ConfigYaml {
  const s = useSettingsStore.getState();
  return {
    theme: s.theme,
    hue: s.hue,
    workingDirectory: s.workingDirectory,
    settingsDirectory: s.settingsDirectory,
    userMode: s.userMode,
    localLLM: { ...s.localLLM },
    defaultModel: s.defaultModel,
    availableModels: s.availableModels,
    selectedModels: s.selectedModels,
    modelEffort: s.modelEffort,
    imageModel: s.imageModel,
    availableImageModels: s.availableImageModels,
    guardrailsConfig: s.guardrailsConfig,
    agentDebugLogging: s.agentDebugLogging,
  };
}

async function getConfigPath(): Promise<string> {
  const dir = await getAppDataDir();
  return `${dir}/config.yaml`;
}

async function writeConfigToFile(): Promise<void> {
  const config = extractConfigFromStore();
  const yaml = YAML.stringify(config);
  const configPath = await getConfigPath();
  await writeFile(configPath, yaml);
  lastKnownContent = yaml;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastKnownContent: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPatchingFromFile = false;
let writeInFlight = false;

function debouncedWriteConfig(): void {
  if (isPatchingFromFile) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    writeInFlight = true;
    writeConfigToFile()
      .catch((err) => {
        console.warn("[config-sync] Failed to write config.yaml:", err);
      })
      .finally(() => {
        writeInFlight = false;
      });
  }, 500);
}

async function loadConfigFromFile(providedContent?: string): Promise<void> {
  const configPath = await getConfigPath();

  if (!(await pathExists(configPath))) {
    // No config file yet — write current store state as initial config
    await writeConfigToFile();
    return;
  }

  try {
    const content = providedContent ?? (await readFile(configPath));
    const parsed = YAML.parse(content) as Partial<ConfigYaml>;
    if (!parsed || typeof parsed !== "object") return;

    isPatchingFromFile = true;
    try {
      const store = useSettingsStore.getState();

      // Patch store field-by-field (only set fields that exist in the file)
      if (parsed.theme !== undefined) store.setTheme(parsed.theme);
      if (parsed.hue !== undefined) store.setHue(parsed.hue);
      if (parsed.workingDirectory !== undefined) store.setWorkingDirectory(parsed.workingDirectory);
      if (parsed.settingsDirectory !== undefined) store.setSettingsDirectory(parsed.settingsDirectory);
      if (parsed.userMode !== undefined) store.setUserMode(parsed.userMode);
      if (parsed.localLLM !== undefined) store.setLocalLLM(parsed.localLLM);
      if (parsed.defaultModel !== undefined) store.setDefaultModel(parsed.defaultModel);
      if (parsed.availableModels !== undefined) store.setAvailableModels(parsed.availableModels);
      if (parsed.selectedModels !== undefined) store.setSelectedModels(parsed.selectedModels);
      // Replace wholesale rather than merging: the file is the source of truth, so a
      // key deleted there must not be resurrected from the store's current state.
      if (parsed.modelEffort !== undefined)
        useSettingsStore.setState({ modelEffort: parsed.modelEffort });
      if (parsed.imageModel !== undefined) store.setImageModel(parsed.imageModel);
      if (parsed.availableImageModels !== undefined) store.setAvailableImageModels(parsed.availableImageModels);
      if (parsed.guardrailsConfig !== undefined) {
        store.setGuardrailsConfig(parsed.guardrailsConfig);
        // Re-sync legacy derived fields
        const gc = parsed.guardrailsConfig;
        if (gc.enabled !== undefined) store.setGuardrails(gc.enabled);
        if (gc.sandbox?.enabled !== undefined) store.setSandboxed(gc.sandbox.enabled);
        store.setYolo(gc.enabled === false);
      }
      if (parsed.agentDebugLogging !== undefined) {
        store.setAgentDebugLogging(parsed.agentDebugLogging);
        setLoggingEnabled(parsed.agentDebugLogging);
      }

      lastKnownContent = content;
    } finally {
      isPatchingFromFile = false;
    }
  } catch (err) {
    console.warn("[config-sync] Failed to parse config.yaml, using defaults:", err);
  }
}

async function pollForFileChanges(): Promise<void> {
  if (debounceTimer || writeInFlight) return;
  try {
    const configPath = await getConfigPath();
    if (!(await pathExists(configPath))) return;
    const content = await readFile(configPath);
    if (content !== lastKnownContent) {
      await loadConfigFromFile(content);
    }
  } catch {
    // File might be mid-write by external editor; next poll catches it
  }
}

let unsubscribe: (() => void) | null = null;

/** Flush any pending debounced write immediately (best-effort before unload) */
function flushPendingWrite(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    writeInFlight = true;
    writeConfigToFile()
      .catch(() => {})
      .finally(() => { writeInFlight = false; });
  }
}

/** Migrate API keys from config.yaml to OS keychain (one-time, idempotent) */
async function migrateApiKeysToKeychain(): Promise<void> {
  try {
    const configPath = await getConfigPath();
    if (!(await pathExists(configPath))) return;

    const content = await readFile(configPath);
    const parsed = YAML.parse(content) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || !("apiKeys" in parsed)) return;

    const apiKeys = parsed.apiKeys as Record<string, string>;
    const { storeApiKey } = await import("@/lib/keychain");
    for (const [provider, key] of Object.entries(apiKeys)) {
      if (key) {
        await storeApiKey(provider, key);
      }
    }

    // Remove apiKeys from config.yaml and rewrite
    delete parsed.apiKeys;
    const yaml = YAML.stringify(parsed);
    await writeFile(configPath, yaml);
    lastKnownContent = yaml;
  } catch (err) {
    console.warn("[config-sync] Migration of API keys to keychain failed (will retry next launch):", err);
  }
}

/** Load API keys from OS keychain into the store */
async function loadKeysFromKeychain(): Promise<void> {
  try {
    const keys = await loadAllApiKeys();
    if (Object.keys(keys).length === 0) return;

    isPatchingFromFile = true;
    try {
      useSettingsStore.setState((state) => ({
        apiKeys: {
          ...state.apiKeys,
          ...Object.fromEntries(
            Object.entries(keys).filter(([, v]) => v),
          ),
        },
      }));
    } finally {
      isPatchingFromFile = false;
    }
  } catch (err) {
    console.warn("[config-sync] Failed to load API keys from keychain:", err);
  }
}

/**
 * Initialize config sync.
 * - In browser mode: no-op.
 * - In Tauri mode: loads config.yaml into store, then subscribes to store changes.
 */
export async function initConfigSync(): Promise<void> {
  if (!isTauri()) return;

  await loadConfigFromFile();
  await migrateApiKeysToKeychain();
  await loadKeysFromKeychain();

  // Subscribe to store changes — write config.yaml on every change (debounced)
  unsubscribe = useSettingsStore.subscribe(debouncedWriteConfig);

  // Flush pending writes before the window closes
  window.addEventListener("beforeunload", flushPendingWrite);

  // Poll for external changes to config.yaml every 2s
  pollTimer = setInterval(() => {
    pollForFileChanges();
  }, 2000);
}

/** Tear down the subscription and polling (useful for testing) */
export function stopConfigSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  window.removeEventListener("beforeunload", flushPendingWrite);
  lastKnownContent = null;
  isPatchingFromFile = false;
  writeInFlight = false;
}
