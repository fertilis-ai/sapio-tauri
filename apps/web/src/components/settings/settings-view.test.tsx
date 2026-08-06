import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetTheme = vi.fn();
const mockSetHue = vi.fn();
const mockSetApiKey = vi.fn();
const mockSetLocalLLM = vi.fn();
const mockSetDefaultModel = vi.fn();
const mockSetWorkingDirectory = vi.fn();
const mockSetSettingsDirectory = vi.fn();
const mockSetAgentDebugLogging = vi.fn();
const mockSetAllowSelfEnhancement = vi.fn();

const mockSettingsStore = {
  apiKeys: { anthropic: "", openai: "", google: "", openrouter: "" },
  localLLM: { enabled: false, provider: "lmstudio" as const, baseUrl: "", model: "" },
  defaultModel: "claude-sonnet-4-20250514",
  homeDir: "/Users/test",
  workingDirectory: "/Users/test/Projects",
  settingsDirectory: "/Users/test/.verbalis-app",
  hue: "neutral" as string,
  agentDebugLogging: false,
  allowSelfEnhancement: true,
  availableModels: [],
  selectedModels: [],
  modelFetchStatus: "idle" as string,
  modelFetchError: null as string | null,
  modelDiscoveryNoDataCollection: false,
  availableSpeechModels: [] as unknown[],
  guardrailsConfig: { enabled: true },
  setHue: mockSetHue,
  setApiKey: mockSetApiKey,
  setLocalLLM: mockSetLocalLLM,
  setDefaultModel: mockSetDefaultModel,
  setWorkingDirectory: mockSetWorkingDirectory,
  setSettingsDirectory: mockSetSettingsDirectory,
  setAgentDebugLogging: mockSetAgentDebugLogging,
  setAllowSelfEnhancement: mockSetAllowSelfEnhancement,
  fetchModels: vi.fn(),
  setModelDiscoveryNoDataCollection: vi.fn(),
  addSelectedModels: vi.fn(),
  removeSelectedModels: vi.fn(),
  setSelectedModels: vi.fn(),
  setGuardrailsConfig: vi.fn(),
  resetGuardrailsToDefaults: vi.fn(),
  applyGuardrailsPreset: vi.fn(),
  importGuardrailsConfig: vi.fn(() => true),
  exportGuardrailsConfig: vi.fn(() => "{}"),
};

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: () => mockSettingsStore,
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: mockSetTheme,
    resolvedTheme: "dark",
  }),
}));

vi.mock("@/lib/models", () => ({
  LOCAL_MODEL_ID: "local",
  getActiveModels: () => [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  ],
}));

vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

vi.mock("@/lib/hue-presets", () => ({
  HUE_PRESETS: [
    { id: "neutral", label: "Neutral", hue: 0, swatch: { light: "#737373", dark: "#a3a3a3" } },
    { id: "blue", label: "Blue", hue: 250, swatch: { light: "#2563eb", dark: "#60a5fa" } },
  ],
}));

// Mock child components that have complex dependency chains
vi.mock("./model-picker", () => ({
  ModelPicker: () => <div data-testid="model-picker">ModelPicker</div>,
}));

vi.mock("./guardrails-section", () => ({
  GuardrailsSection: () => <div data-testid="guardrails-section">GuardrailsSection</div>,
}));

vi.mock("lucide-react", () => ({
  Moon: (props: any) => <span data-testid="icon-Moon" {...props} />,
  Sun: (props: any) => <span data-testid="icon-Sun" {...props} />,
  Monitor: (props: any) => <span data-testid="icon-Monitor" {...props} />,
  Eye: (props: any) => <span data-testid="icon-Eye" {...props} />,
  EyeOff: (props: any) => <span data-testid="icon-EyeOff" {...props} />,
  FolderOpen: (props: any) => <span data-testid="icon-FolderOpen" {...props} />,
  Palette: (props: any) => <span data-testid="icon-Palette" {...props} />,
  FolderCog: (props: any) => <span data-testid="icon-FolderCog" {...props} />,
  Shield: (props: any) => <span data-testid="icon-Shield" {...props} />,
  Key: (props: any) => <span data-testid="icon-Key" {...props} />,
  Cpu: (props: any) => <span data-testid="icon-Cpu" {...props} />,
  Server: (props: any) => <span data-testid="icon-Server" {...props} />,
  Bug: (props: any) => <span data-testid="icon-Bug" {...props} />,
  Bot: (props: any) => <span data-testid="icon-Bot" {...props} />,
  Info: (props: any) => <span data-testid="icon-Info" {...props} />,
  RefreshCw: (props: any) => <span data-testid="icon-RefreshCw" {...props} />,
  Loader2: (props: any) => <span data-testid="icon-Loader2" {...props} />,
}));

// Import after mocks
import { SettingsView } from "./settings-view";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsStore.apiKeys = { anthropic: "", openai: "", google: "", openrouter: "" };
    mockSettingsStore.localLLM = { enabled: false, provider: "lmstudio", baseUrl: "", model: "" };
    mockSettingsStore.hue = "neutral";
    mockSettingsStore.agentDebugLogging = false;
    mockSettingsStore.defaultModel = "claude-sonnet-4-20250514";
  });

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  describe("layout", () => {
    it("renders the Settings header", () => {
      render(<SettingsView />);
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("renders the Appearance section", () => {
      render(<SettingsView />);
      expect(screen.getByText("Appearance")).toBeInTheDocument();
    });

    it("renders the API Keys section", () => {
      render(<SettingsView />);
      expect(screen.getByText("API Keys")).toBeInTheDocument();
    });

    it("renders the Models section", () => {
      render(<SettingsView />);
      expect(screen.getByText("Models")).toBeInTheDocument();
    });

    it("renders the Local LLM section", () => {
      render(<SettingsView />);
      expect(screen.getByText("Local LLM")).toBeInTheDocument();
    });

    it("renders the Directories section", () => {
      render(<SettingsView />);
      expect(screen.getByText("Directories")).toBeInTheDocument();
    });

    it("renders the About section", () => {
      render(<SettingsView />);
      expect(screen.getByText("About")).toBeInTheDocument();
    });

    it("renders the guardrails section", () => {
      render(<SettingsView />);
      expect(screen.getByTestId("guardrails-section")).toBeInTheDocument();
    });

    it("does not render Debug section in non-Tauri environment", () => {
      render(<SettingsView />);
      // DebugSection returns null when isTauri() is false
      expect(screen.queryByText("Debug Logging")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Appearance section
  // -------------------------------------------------------------------------

  describe("appearance", () => {
    it("renders theme buttons (Light, Dark, System)", () => {
      render(<SettingsView />);
      expect(screen.getByText("Light")).toBeInTheDocument();
      expect(screen.getByText("Dark")).toBeInTheDocument();
      expect(screen.getByText("System")).toBeInTheDocument();
    });

    it("calls setTheme when clicking Light button", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      await user.click(screen.getByText("Light"));
      expect(mockSetTheme).toHaveBeenCalledWith("light");
    });

    it("calls setTheme when clicking Dark button", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      await user.click(screen.getByText("Dark"));
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("calls setTheme when clicking System button", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      await user.click(screen.getByText("System"));
      expect(mockSetTheme).toHaveBeenCalledWith("system");
    });

    it("renders hue preset buttons", () => {
      render(<SettingsView />);
      // Two hue presets are mocked: Neutral and Blue
      expect(screen.getByTitle("Neutral")).toBeInTheDocument();
      expect(screen.getByTitle("Blue")).toBeInTheDocument();
    });

    it("calls setHue when clicking a hue preset", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      await user.click(screen.getByTitle("Blue"));
      expect(mockSetHue).toHaveBeenCalledWith("blue");
    });

    it("shows selected hue label", () => {
      render(<SettingsView />);
      expect(screen.getByText("Neutral")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // API Keys section
  // -------------------------------------------------------------------------

  describe("API keys", () => {
    it("renders all API key providers", () => {
      render(<SettingsView />);
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Google")).toBeInTheDocument();
      expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    });

    it("renders password inputs for API keys", () => {
      render(<SettingsView />);
      const passwordInputs = screen.getAllByPlaceholderText(/^sk-|^AIza/);
      expect(passwordInputs.length).toBe(4);
    });

    it("calls setApiKey when changing an API key value", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      const anthropicInput = screen.getByPlaceholderText("sk-ant-...");
      await user.type(anthropicInput, "test-key");
      expect(mockSetApiKey).toHaveBeenCalled();
      // Each character triggers onChange, so check first call
      expect(mockSetApiKey.mock.calls[0][0]).toBe("anthropic");
    });

    it("shows (Get key) link for OpenRouter", () => {
      render(<SettingsView />);
      expect(screen.getByText("(Get key)")).toBeInTheDocument();
    });

    it("renders the security note about local storage", () => {
      render(<SettingsView />);
      expect(
        screen.getByText(/API keys are stored locally/)
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Local LLM section
  // -------------------------------------------------------------------------

  describe("local LLM", () => {
    it("renders the enable checkbox", () => {
      render(<SettingsView />);
      expect(screen.getByText("Enable Local Provider")).toBeInTheDocument();
    });

    it("renders provider buttons (LM Studio and Ollama)", () => {
      render(<SettingsView />);
      expect(screen.getByText("LM Studio")).toBeInTheDocument();
      expect(screen.getByText("Ollama")).toBeInTheDocument();
    });

    it("calls setLocalLLM when toggling the enable checkbox", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      const checkbox = screen.getByRole("checkbox", { name: /Enable Local Provider/i });
      await user.click(checkbox);
      expect(mockSetLocalLLM).toHaveBeenCalledWith({ enabled: true });
    });

    it("renders Base URL input", () => {
      render(<SettingsView />);
      expect(screen.getByText("Base URL")).toBeInTheDocument();
    });

    it("renders Model input", () => {
      render(<SettingsView />);
      // "Model" appears in multiple places (Models section, Local LLM Model label)
      const modelLabels = screen.getAllByText("Model");
      expect(modelLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Models section
  // -------------------------------------------------------------------------

  describe("models", () => {
    it("renders Default Text Model label", () => {
      render(<SettingsView />);
      expect(screen.getByText("Default Text Model")).toBeInTheDocument();
    });

    it("renders model dropdown with options", () => {
      render(<SettingsView />);
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });

    it("renders Text Model Discovery with ModelPicker component", () => {
      render(<SettingsView />);
      expect(screen.getByText("Text Model Discovery")).toBeInTheDocument();
      expect(screen.getByTestId("model-picker")).toBeInTheDocument();
    });

    it("renders the Zero data retention checkbox and toggles the setting", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      const checkbox = screen.getByRole("checkbox", { name: /Zero data retention/i });
      expect(checkbox).not.toBeChecked();
      await user.click(checkbox);
      expect(mockSettingsStore.setModelDiscoveryNoDataCollection).toHaveBeenCalledWith(true);
    });

    it("selects the stored default model when it is still available", () => {
      render(<SettingsView />);
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("claude-sonnet-4-20250514");
    });

    it("falls back to None (disabled) when the stored default model is gone", () => {
      mockSettingsStore.defaultModel = "model-that-was-removed";
      render(<SettingsView />);
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("");
      const none = screen.getByRole("option", { name: "None (disabled)" }) as HTMLOptionElement;
      expect(none.selected).toBe(true);
    });

    it("clears the default model when None (disabled) is selected", async () => {
      const user = userEvent.setup();
      render(<SettingsView />);
      await user.selectOptions(screen.getByRole("combobox"), "");
      expect(mockSetDefaultModel).toHaveBeenCalledWith("");
    });

    it("renders Text Model Discovery before Default Text Model", () => {
      render(<SettingsView />);
      const discovery = screen.getByText("Text Model Discovery");
      const defaultModel = screen.getByText("Default Text Model");
      expect(
        discovery.compareDocumentPosition(defaultModel) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Directories section
  // -------------------------------------------------------------------------

  describe("directories", () => {
    it("renders Working Directory input with current value", () => {
      render(<SettingsView />);
      expect(screen.getByText("Working Directory")).toBeInTheDocument();
      const input = screen.getByDisplayValue("/Users/test/Projects");
      expect(input).toBeInTheDocument();
    });

    it("renders Settings Directory input with current value", () => {
      render(<SettingsView />);
      expect(screen.getByText("Settings Directory")).toBeInTheDocument();
      const input = screen.getByDisplayValue("/Users/test/.verbalis-app");
      expect(input).toBeInTheDocument();
    });

    it("disables folder-picker buttons in non-Tauri mode", () => {
      render(<SettingsView />);
      const folderButtons = screen.getAllByTestId("icon-FolderOpen");
      for (const icon of folderButtons) {
        const button = icon.closest("button");
        expect(button).toBeDisabled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // About section
  // -------------------------------------------------------------------------

  describe("about", () => {
    it("renders version information", () => {
      render(<SettingsView />);
      expect(screen.getByText("0.1.0")).toBeInTheDocument();
    });

    it("renders build information", () => {
      render(<SettingsView />);
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    it("renders runtime information", () => {
      render(<SettingsView />);
      expect(screen.getByText("Tauri 2.9")).toBeInTheDocument();
    });

    it("renders description text", () => {
      render(<SettingsView />);
      expect(
        screen.getByText(/Verbalis is a local-first AI agent/)
      ).toBeInTheDocument();
    });
  });
});
