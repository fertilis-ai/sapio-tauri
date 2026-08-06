import * as React from "react";
import { Moon, Sun, Monitor, Eye, EyeOff, FolderOpen, Palette, FolderCog, Key, Cpu, Server, Bug, Bot, Info, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/components/theme-provider";
import { LOCAL_MODEL_ID, getActiveModels, type ChatModelId } from "@/lib/models";
import { ModelPicker } from "./model-picker";
import { GuardrailsSection } from "./guardrails-section";
import { isTauri } from "@/lib/storage";
import { open } from "@tauri-apps/plugin-shell";
import type { SettingsSection } from "./settings-sidebar";
import { HUE_PRESETS } from "@/lib/hue-presets";

const SECTION_IDS: SettingsSection[] = [
  "appearance",
  "directories",
  "guardrails",
  "agent",
  "api-keys",
  "models",
  "local-llm",
  "debug",
  "about",
];

interface SettingsViewProps {
  selectedSection?: SettingsSection;
  onSelectSection?: (section: SettingsSection) => void;
}

export function SettingsView({ selectedSection, onSelectSection }: SettingsViewProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isScrollingFromClick = React.useRef(false);

  // Scroll to section when selectedSection changes from sidebar click
  React.useEffect(() => {
    if (!selectedSection) return;
    const el = document.getElementById(`section-${selectedSection}`);
    if (el) {
      isScrollingFromClick.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Reset flag after scroll animation completes
      const timer = setTimeout(() => {
        isScrollingFromClick.current = false;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [selectedSection]);

  // IntersectionObserver to sync sidebar highlight on manual scroll
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !onSelectSection) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingFromClick.current) return;
        // Find the topmost visible section
        let topSection: SettingsSection | null = null;
        let topY = Infinity;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const rect = entry.boundingClientRect;
            if (rect.top < topY) {
              topY = rect.top;
              topSection = entry.target.id.replace("section-", "") as SettingsSection;
            }
          }
        }
        if (topSection) {
          onSelectSection(topSection);
        }
      },
      {
        root: container,
        rootMargin: "-10% 0px -80% 0px",
        threshold: 0,
      }
    );

    for (const id of SECTION_IDS) {
      const el = document.getElementById(`section-${id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [onSelectSection]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center border-b border-border px-2">
        <span className="text-sm font-medium">Settings</span>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-8">
          <AppearanceSection />
          <DirectoriesSection />
          <section id="section-guardrails" className="border-b border-border pb-8">
            <GuardrailsSection />
          </section>
          <AgentSection />
          <ApiKeysSection />
          <ModelsSection />
          <LocalLlmSection />
          <DebugSection />
          <AboutSection />
        </div>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const { hue, setHue } = useSettingsStore();
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  const selectedPreset = HUE_PRESETS.find((p) => p.id === hue);

  return (
    <section id="section-appearance" className="border-b border-border pb-8">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Palette className="h-4.5 w-4.5 text-muted-foreground" />Appearance</h2>
      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium">Theme</label>
          <div className="mt-2 flex gap-2">
            <Button
              variant={theme === "light" ? "secondary" : "outline"}
              onClick={() => setTheme("light")}
              className="gap-2"
            >
              <Sun className="h-4 w-4" />
              Light
            </Button>
            <Button
              variant={theme === "dark" ? "secondary" : "outline"}
              onClick={() => setTheme("dark")}
              className="gap-2"
            >
              <Moon className="h-4 w-4" />
              Dark
            </Button>
            <Button
              variant={theme === "system" ? "secondary" : "outline"}
              onClick={() => setTheme("system")}
              className="gap-2"
            >
              <Monitor className="h-4 w-4" />
              System
            </Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Hue</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {HUE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setHue(preset.id)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                  hue === preset.id ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
                }`}
                title={preset.label}
              >
                {preset.id === "neutral" ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" className="rounded-full">
                    <circle cx="12" cy="12" r="12" fill={mode === "dark" ? "#525252" : "#d4d4d4"} />
                    <line x1="4" y1="20" x2="20" y2="4" stroke={mode === "dark" ? "#a3a3a3" : "#737373"} strokeWidth="2" />
                  </svg>
                ) : (
                  <span
                    className="block h-6 w-6 rounded-full"
                    style={{ backgroundColor: preset.swatch[mode] }}
                  />
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {selectedPreset?.label ?? "Neutral"}
          </p>
        </div>
      </div>
    </section>
  );
}

function ApiKeysSection() {
  const { apiKeys, setApiKey } = useSettingsStore();
  const [showKeys, setShowKeys] = React.useState<Record<string, boolean>>({});

  const providers = [
    { id: "anthropic" as const, name: "Anthropic", placeholder: "sk-ant-..." },
    { id: "openai" as const, name: "OpenAI", placeholder: "sk-..." },
    { id: "google" as const, name: "Google", placeholder: "AIza..." },
    { id: "openrouter" as const, name: "OpenRouter", placeholder: "sk-or-...", url: "https://openrouter.ai/keys" },
  ];

  return (
    <section id="section-api-keys" className="border-b border-border pb-8">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Key className="h-4.5 w-4.5 text-muted-foreground" />API Keys</h2>
      <div className="space-y-4">
        {providers.map((provider) => (
          <div key={provider.id}>
            <label className="text-sm font-medium">
              {provider.name}
              {provider.url && (
                <button
                  type="button"
                  className="ml-1 text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                  onClick={() => {
                    if (isTauri()) {
                      open(provider.url!);
                    } else {
                      window.open(provider.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  (Get key)
                </button>
              )}
            </label>
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKeys[provider.id] ? "text" : "password"}
                  value={apiKeys[provider.id]}
                  onChange={(e) => setApiKey(provider.id, e.target.value)}
                  placeholder={provider.placeholder}
                  className="pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1 top-1"
                  onClick={() =>
                    setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))
                  }
                >
                  {showKeys[provider.id] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          API keys are stored locally in your browser. In the desktop app, they are stored securely using the system keychain.
        </p>
      </div>
    </section>
  );
}

function LocalLlmSection() {
  const { localLLM, setLocalLLM } = useSettingsStore();
  const baseDefaults = {
    lmstudio: "http://localhost:1234/v1",
    ollama: "http://localhost:11434/v1",
  } as const;

  const handleProviderChange = (provider: typeof localLLM.provider) => {
    const shouldSwap =
      localLLM.baseUrl.trim().length === 0 ||
      localLLM.baseUrl.trim() === baseDefaults[localLLM.provider];
    setLocalLLM({
      provider,
      baseUrl: shouldSwap ? baseDefaults[provider] : localLLM.baseUrl,
    });
  };

  return (
    <section id="section-local-llm" className="border-b border-border pb-8">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Server className="h-4.5 w-4.5 text-muted-foreground" />Local LLM</h2>
      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={localLLM.enabled}
            onChange={(e) => setLocalLLM({ enabled: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          <div>
            <span className="text-sm">Enable Local Provider</span>
            <p className="text-xs text-muted-foreground">
              Use LM Studio or Ollama for on-device inference
            </p>
          </div>
        </label>

        <div>
          <label className="text-sm font-medium">Provider</label>
          <div className="mt-2 flex gap-2">
            <Button
              variant={localLLM.provider === "lmstudio" ? "secondary" : "outline"}
              onClick={() => handleProviderChange("lmstudio")}
            >
              LM Studio
            </Button>
            <Button
              variant={localLLM.provider === "ollama" ? "secondary" : "outline"}
              onClick={() => handleProviderChange("ollama")}
            >
              Ollama
            </Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Base URL</label>
          <div className="mt-1">
            <Input
              value={localLLM.baseUrl}
              onChange={(e) => setLocalLLM({ baseUrl: e.target.value })}
              placeholder={baseDefaults[localLLM.provider]}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            LM Studio default: {baseDefaults.lmstudio} · Ollama default: {baseDefaults.ollama}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Model</label>
          <div className="mt-1">
            <Input
              value={localLLM.model}
              onChange={(e) => setLocalLLM({ model: e.target.value })}
              placeholder={localLLM.provider === "lmstudio" ? "llama-3.1-8b-instruct" : "llama3.1"}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional. Leave blank to use the provider default.
          </p>
        </div>
      </div>
    </section>
  );
}

function ModelsSection() {
  const {
    defaultModel, setDefaultModel, localLLM, selectedModels, modelFetchStatus, modelFetchError, fetchModels,
    modelDiscoveryNoDataCollection, setModelDiscoveryNoDataCollection,
    apiKeys, imageModel, setImageModel, availableImageModels, imageModelFetchStatus, imageModelFetchError, fetchImageModels,
    transcriptionModel, setTranscriptionModel, availableTranscriptionModels, transcriptionModelFetchStatus, transcriptionModelFetchError, fetchTranscriptionModels,
    speechModel, setSpeechModel, speechVoice, setSpeechVoice, availableSpeechModels, speechModelFetchStatus, speechModelFetchError, fetchSpeechModels,
  } = useSettingsStore();
  const speechVoices = availableSpeechModels.find((m) => m.id === speechModel)?.voices ?? [];
  const activeModels = getActiveModels(selectedModels);
  const localProviderLabel = localLLM.provider === "lmstudio" ? "LM Studio" : "Ollama";
  const localModelLabel = localLLM.model.trim() || `${localProviderLabel} (default)`;
  const localOptionLabel = localLLM.enabled ? `Local LLM - ${localModelLabel}` : "Local LLM (disabled)";
  const options: Array<{ value: ChatModelId; label: string }> = [
    ...activeModels.map((model) => ({
      value: model.id,
      label: `${model.name} (${model.provider})`,
    })),
    { value: LOCAL_MODEL_ID, label: localOptionLabel },
  ];
  // A stale default (e.g. the model was removed from discovery) is not a real
  // selection — show "None (disabled)" instead of silently showing option one.
  const hasDefaultModel = options.some((option) => option.value === defaultModel);

  const canFetch = isTauri();
  const isFetching = modelFetchStatus === "fetching";

  return (
    <section id="section-models" className="border-b border-border pb-8">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Cpu className="h-4.5 w-4.5 text-muted-foreground" />Models</h2>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Text Model Discovery</label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchModels()}
              disabled={!canFetch || isFetching}
              title={!canFetch ? "Model fetching requires the desktop app" : undefined}
              className="gap-2 h-6 text-xs"
            >
              {isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Refresh
            </Button>
            {!canFetch && (
              <span className="text-xs text-muted-foreground">Desktop app required</span>
            )}
            {modelFetchError && (
              <span className="text-xs text-destructive">{modelFetchError}</span>
            )}
          </div>
          <label className="mt-2 flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={modelDiscoveryNoDataCollection}
              onChange={(e) => setModelDiscoveryNoDataCollection(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <div>
              <span className="text-sm">Zero data retention</span>
              <p className="text-xs text-muted-foreground">
                Only show OpenRouter models served by endpoints that don't retain your data.
              </p>
            </div>
          </label>
          <div className="mt-2">
            <ModelPicker />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Default Text Model</label>
          <div className="mt-2">
            <select
              value={hasDefaultModel ? defaultModel : ""}
              onChange={(e) => setDefaultModel(e.target.value as ChatModelId)}
              className="w-full rounded-md border border-input bg-transparent dark:bg-input/30 h-8 px-2.5 py-1 text-sm text-foreground"
            >
              <option value="">None (disabled)</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Used when the app starts and for new chats unless you change it in the model selector.
          </p>
        </div>

        {apiKeys.openrouter.trim() && (
          <div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Image Model</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchImageModels()}
                disabled={!canFetch || imageModelFetchStatus === "fetching"}
                title={!canFetch ? "Model fetching requires the desktop app" : undefined}
                className="gap-2 h-6 text-xs"
              >
                {imageModelFetchStatus === "fetching" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Refresh
              </Button>
              {imageModelFetchError && (
                <span className="text-xs text-destructive">{imageModelFetchError}</span>
              )}
            </div>
            <div className="mt-2">
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent dark:bg-input/30 h-8 px-2.5 py-1 text-sm text-foreground"
              >
                <option value="">None (disabled)</option>
                {availableImageModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {availableImageModels.length === 0
                ? "Click Refresh to load OpenRouter image models."
                : "Enables the generate_image chat tool. Images are saved to ~/.verbalis/images."}
            </p>
          </div>
        )}

        {apiKeys.openrouter.trim() && (
          <div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Transcription Model</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTranscriptionModels()}
                disabled={!canFetch || transcriptionModelFetchStatus === "fetching"}
                title={!canFetch ? "Model fetching requires the desktop app" : undefined}
                className="gap-2 h-6 text-xs"
              >
                {transcriptionModelFetchStatus === "fetching" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Refresh
              </Button>
              {transcriptionModelFetchError && (
                <span className="text-xs text-destructive">{transcriptionModelFetchError}</span>
              )}
            </div>
            <div className="mt-2">
              <select
                value={transcriptionModel}
                onChange={(e) => setTranscriptionModel(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent dark:bg-input/30 h-8 px-2.5 py-1 text-sm text-foreground"
              >
                <option value="">None (disabled)</option>
                {availableTranscriptionModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {availableTranscriptionModels.length === 0
                ? "Click Refresh to load OpenRouter transcription models."
                : "Enables the microphone button in chat for voice input."}
            </p>
          </div>
        )}

        {apiKeys.openrouter.trim() && (
          <div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Speech Model</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSpeechModels()}
                disabled={!canFetch || speechModelFetchStatus === "fetching"}
                title={!canFetch ? "Model fetching requires the desktop app" : undefined}
                className="gap-2 h-6 text-xs"
              >
                {speechModelFetchStatus === "fetching" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Refresh
              </Button>
              {speechModelFetchError && (
                <span className="text-xs text-destructive">{speechModelFetchError}</span>
              )}
            </div>
            <div className="mt-2">
              <select
                value={speechModel}
                onChange={(e) => setSpeechModel(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent dark:bg-input/30 h-8 px-2.5 py-1 text-sm text-foreground"
              >
                <option value="">None (disabled)</option>
                {availableSpeechModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            {speechVoices.length > 0 && (
              <div className="mt-2">
                <label className="text-sm font-medium">Voice</label>
                <div className="mt-2">
                  <select
                    value={speechVoice}
                    onChange={(e) => setSpeechVoice(e.target.value)}
                    className="w-full rounded-md border border-input bg-transparent dark:bg-input/30 h-8 px-2.5 py-1 text-sm text-foreground"
                  >
                    {speechVoices.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {availableSpeechModels.length === 0
                ? "Click Refresh to load OpenRouter text-to-speech models."
                : "Enables the read-aloud button on assistant replies."}
            </p>
          </div>
        )}

      </div>
    </section>
  );
}

function DirectoriesSection() {
  const { homeDir, workingDirectory, setWorkingDirectory, settingsDirectory, setSettingsDirectory } = useSettingsStore();

  const handlePickDirectory = async (setter: (dir: string) => void, current: string) => {
    if (!isTauri()) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, defaultPath: current || undefined });
    if (selected) setter(selected as string);
  };

  return (
    <section id="section-directories" className="border-b border-border pb-8">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><FolderCog className="h-4.5 w-4.5 text-muted-foreground" />Directories</h2>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Working Directory</label>
          <div className="mt-1 flex gap-2">
            <Input
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder={homeDir ? `${homeDir}/Projects` : "~/Projects"}
            />
            <Button
              variant="outline"
              size="icon"
              disabled={!isTauri()}
              onClick={() => handlePickDirectory(setWorkingDirectory, workingDirectory)}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            The directory shown in the Files browser
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">Settings Directory</label>
          <div className="mt-1 flex gap-2">
            <Input
              value={settingsDirectory}
              onChange={(e) => setSettingsDirectory(e.target.value)}
              placeholder={homeDir ? `${homeDir}/.verbalis-app` : "~/.verbalis-app"}
            />
            <Button
              variant="outline"
              size="icon"
              disabled={!isTauri()}
              onClick={() => handlePickDirectory(setSettingsDirectory, settingsDirectory)}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Where Verbalis stores its configuration and data
          </p>
        </div>
      </div>
    </section>
  );
}

function AgentSection() {
  const { allowSelfEnhancement, setAllowSelfEnhancement } = useSettingsStore();

  return (
    <section id="section-agent" className="border-b border-border pb-8">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Bot className="h-4.5 w-4.5 text-muted-foreground" />Agent</h2>
      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allowSelfEnhancement}
            onChange={(e) => setAllowSelfEnhancement(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <div className="flex-1">
            <span className="text-sm">Allow Self-Enhancement</span>
            <p className="text-xs text-muted-foreground">
              Let the agent create and edit its own Toolbox files (prompts, memories,
              agents, skills, workflows). Writes and deletes still require confirmation.
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}

function DebugSection() {
  const {
    homeDir,
    agentDebugLogging,
    setAgentDebugLogging,
  } = useSettingsStore();

  // Only show in Tauri (desktop) environment
  if (!isTauri()) {
    return null;
  }

  return (
    <section id="section-debug" className="border-b border-border pb-8">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Bug className="h-4.5 w-4.5 text-muted-foreground" />Debug</h2>
      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agentDebugLogging}
            onChange={(e) => setAgentDebugLogging(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <div className="flex-1">
            <span className="text-sm">Debug Logging</span>
            <p className="text-xs text-muted-foreground">
              Write detailed agent execution logs to {homeDir || "~"}/.verbalis/logs/
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section id="section-about">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Info className="h-4.5 w-4.5 text-muted-foreground" />About</h2>
      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="text-sm font-medium">0.1.0</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Build</span>
          <span className="text-sm font-medium">Development</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Runtime</span>
          <span className="text-sm font-medium">Tauri 2.9</span>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Verbalis is a local-first AI agent for non-technical users. All data is stored on your device.
      </p>
    </section>
  );
}
