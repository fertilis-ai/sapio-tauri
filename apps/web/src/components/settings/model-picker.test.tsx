import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchModels = vi.fn();
const mockAddSelectedModels = vi.fn();
const mockRemoveSelectedModels = vi.fn();
const mockSetSelectedModels = vi.fn();

const mockSettingsStore = {
  availableModels: [] as any[],
  selectedModels: [] as any[],
  modelFetchStatus: "idle" as string,
  modelFetchError: null as string | null,
  modelDiscoveryNoDataCollection: false,
  fetchModels: mockFetchModels,
  addSelectedModels: mockAddSelectedModels,
  removeSelectedModels: mockRemoveSelectedModels,
  setSelectedModels: mockSetSelectedModels,
};

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: () => mockSettingsStore,
}));

vi.mock("@/lib/storage", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("lucide-react", () => ({
  RefreshCw: (props: any) => <span data-testid="icon-RefreshCw" {...props} />,
  Loader2: (props: any) => <span data-testid="icon-Loader2" {...props} />,
  ChevronRight: (props: any) => <span data-testid="icon-ChevronRight" {...props} />,
  ChevronDown: (props: any) => <span data-testid="icon-ChevronDown" {...props} />,
  ChevronsRight: (props: any) => <span data-testid="icon-ChevronsRight" {...props} />,
  ChevronsLeft: (props: any) => <span data-testid="icon-ChevronsLeft" {...props} />,
  ChevronRightIcon: (props: any) => <span data-testid="icon-ChevronRightIcon" {...props} />,
  ChevronLeftIcon: (props: any) => <span data-testid="icon-ChevronLeftIcon" {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    title,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
    [k: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange, placeholder, ...rest }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} {...rest} />
  ),
}));

// Import after mocks
import { ModelPicker } from "./model-picker";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ModelPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsStore.availableModels = [];
    mockSettingsStore.selectedModels = [];
    mockSettingsStore.modelFetchStatus = "idle";
    mockSettingsStore.modelFetchError = null;
    mockSettingsStore.modelDiscoveryNoDataCollection = false;
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe("rendering", () => {
    it("renders Available Models panel", () => {
      render(<ModelPicker />);
      expect(screen.getByText("Available Models")).toBeInTheDocument();
    });

    it("renders Selected Models panel", () => {
      render(<ModelPicker />);
      expect(screen.getByText("Selected Models")).toBeInTheDocument();
    });

    it("renders filter inputs for both panels", () => {
      render(<ModelPicker />);
      const filterInputs = screen.getAllByPlaceholderText("Filter...");
      expect(filterInputs).toHaveLength(2);
    });

    it("renders transfer buttons (add all, add selected, remove selected, remove all)", () => {
      render(<ModelPicker />);
      expect(screen.getByTitle("Add all")).toBeInTheDocument();
      expect(screen.getByTitle("Add selected")).toBeInTheDocument();
      expect(screen.getByTitle("Remove selected")).toBeInTheDocument();
      expect(screen.getByTitle("Remove all")).toBeInTheDocument();
    });

    it("renders help text about selection", () => {
      render(<ModelPicker />);
      expect(
        screen.getByText(/Selected models appear in the model dropdowns/)
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  describe("empty states", () => {
    it("shows 'Click Refresh to fetch models' when no models fetched", () => {
      render(<ModelPicker />);
      expect(screen.getByText("Click Refresh to fetch models")).toBeInTheDocument();
    });

    it("shows 'All models selected' when all available are selected", () => {
      const models = [
        { id: "m1", name: "Model 1", provider: "anthropic" },
        { id: "m2", name: "Model 2", provider: "openai" },
      ];
      mockSettingsStore.availableModels = models;
      mockSettingsStore.selectedModels = [...models];
      render(<ModelPicker />);
      expect(screen.getByText("All models selected")).toBeInTheDocument();
    });

    it("shows 'No models selected (using defaults)' when none selected", () => {
      render(<ModelPicker />);
      expect(screen.getByText("No models selected (using defaults)")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Refresh button
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Available models panel
  // -------------------------------------------------------------------------

  describe("available models panel", () => {
    it("groups models by provider", () => {
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
        { id: "gpt-1", name: "GPT 1", provider: "openai" },
      ];
      render(<ModelPicker />);
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    it("shows model count per provider", () => {
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
        { id: "claude-2", name: "Claude 2", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      expect(screen.getByText("(2)")).toBeInTheDocument();
    });

    it("renders model items under expanded provider groups", () => {
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      expect(screen.getByText("Claude 1")).toBeInTheDocument();
    });

    it("collapses a provider group when clicking on it", async () => {
      const user = userEvent.setup();
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      expect(screen.getByText("Claude 1")).toBeInTheDocument();

      // Click the provider header to collapse
      await user.click(screen.getByText("Anthropic"));
      expect(screen.queryByText("Claude 1")).not.toBeInTheDocument();

      // Click again to expand
      await user.click(screen.getByText("Anthropic"));
      expect(screen.getByText("Claude 1")).toBeInTheDocument();
    });

    it("filters models by search query", async () => {
      const user = userEvent.setup();
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
        { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      ];
      render(<ModelPicker />);
      const filterInputs = screen.getAllByPlaceholderText("Filter...");
      await user.type(filterInputs[0], "Claude");
      expect(screen.getByText("Claude 1")).toBeInTheDocument();
      expect(screen.queryByText("GPT-4o")).not.toBeInTheDocument();
    });

    it("hides non-ZDR OpenRouter models when Zero data retention is enabled", () => {
      mockSettingsStore.modelDiscoveryNoDataCollection = true;
      mockSettingsStore.availableModels = [
        { id: "anthropic/claude-3", name: "Claude 3 (OR)", provider: "openrouter", zdr: true },
        { id: "meta/llama-3", name: "Llama 3 (OR)", provider: "openrouter" },
        { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      ];
      render(<ModelPicker />);
      expect(screen.getByText("Claude 3 (OR)")).toBeInTheDocument();
      expect(screen.queryByText("Llama 3 (OR)")).not.toBeInTheDocument();
      expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    });

    it("shows all models when Zero data retention is disabled", () => {
      mockSettingsStore.modelDiscoveryNoDataCollection = false;
      mockSettingsStore.availableModels = [
        { id: "anthropic/claude-3", name: "Claude 3 (OR)", provider: "openrouter", zdr: true },
        { id: "meta/llama-3", name: "Llama 3 (OR)", provider: "openrouter" },
      ];
      render(<ModelPicker />);
      expect(screen.getByText("Claude 3 (OR)")).toBeInTheDocument();
      expect(screen.getByText("Llama 3 (OR)")).toBeInTheDocument();
    });

    it("badges ZDR models in the available panel, and only those", () => {
      mockSettingsStore.modelDiscoveryNoDataCollection = false;
      mockSettingsStore.availableModels = [
        { id: "anthropic/claude-3", name: "Claude 3 (OR)", provider: "openrouter", zdr: true },
        { id: "meta/llama-3", name: "Llama 3 (OR)", provider: "openrouter" },
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      // An untagged model means "unknown", never "retains data" — exactly one badge.
      expect(screen.getAllByText("ZDR")).toHaveLength(1);
    });

    it("does not badge models that are merely untagged", () => {
      mockSettingsStore.modelDiscoveryNoDataCollection = false;
      mockSettingsStore.availableModels = [
        { id: "meta/llama-3", name: "Llama 3 (OR)", provider: "openrouter" },
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      expect(screen.queryByText("ZDR")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Selected models panel
  // -------------------------------------------------------------------------

  describe("selected models panel", () => {
    it("renders selected models in the right panel", () => {
      mockSettingsStore.selectedModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      // The model name should appear in the right panel
      expect(screen.getByText("Claude 1")).toBeInTheDocument();
    });

    it("shows provider label next to selected models", () => {
      mockSettingsStore.selectedModels = [
        { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      ];
      render(<ModelPicker />);
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    it("badges ZDR models in the selected panel alongside the provider label", () => {
      mockSettingsStore.selectedModels = [
        { id: "anthropic/claude-3", name: "Claude 3 (OR)", provider: "openrouter", zdr: true },
        { id: "meta/llama-3", name: "Llama 3 (OR)", provider: "openrouter" },
      ];
      render(<ModelPicker />);
      expect(screen.getAllByText("ZDR")).toHaveLength(1);
      expect(screen.getAllByText("OpenRouter")).toHaveLength(2);
    });

    it("filters selected models by search query", async () => {
      const user = userEvent.setup();
      mockSettingsStore.selectedModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
        { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      ];
      render(<ModelPicker />);
      const filterInputs = screen.getAllByPlaceholderText("Filter...");
      await user.type(filterInputs[1], "GPT");
      // Claude should no longer match the filter in the right panel
      expect(screen.getByText("GPT-4o")).toBeInTheDocument();
      // Check via "No matches" not showing (both are rendered), but Claude 1 should still show
      // in the available panel if not selected. Since Claude 1 IS selected, it won't show in available.
    });

    it("shows 'No matches' when filter does not match any selected model", async () => {
      const user = userEvent.setup();
      mockSettingsStore.selectedModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      const filterInputs = screen.getAllByPlaceholderText("Filter...");
      await user.type(filterInputs[1], "zzzzz");
      expect(screen.getByText("No matches")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Transfer actions
  // -------------------------------------------------------------------------

  describe("transfer actions", () => {
    it("disables 'Add all' when no available models", () => {
      render(<ModelPicker />);
      const addAllBtn = screen.getByTitle("Add all");
      expect(addAllBtn).toBeDisabled();
    });

    it("disables 'Add selected' when nothing is selected in left panel", () => {
      render(<ModelPicker />);
      const addSelectedBtn = screen.getByTitle("Add selected");
      expect(addSelectedBtn).toBeDisabled();
    });

    it("disables 'Remove selected' when nothing is selected in right panel", () => {
      render(<ModelPicker />);
      const removeSelectedBtn = screen.getByTitle("Remove selected");
      expect(removeSelectedBtn).toBeDisabled();
    });

    it("disables 'Remove all' when no models are selected", () => {
      render(<ModelPicker />);
      const removeAllBtn = screen.getByTitle("Remove all");
      expect(removeAllBtn).toBeDisabled();
    });

    it("enables 'Add all' when available models exist", () => {
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      const addAllBtn = screen.getByTitle("Add all");
      expect(addAllBtn).not.toBeDisabled();
    });

    it("calls addSelectedModels with all available when clicking Add all", async () => {
      const user = userEvent.setup();
      const models = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
        { id: "gpt-1", name: "GPT 1", provider: "openai" },
      ];
      mockSettingsStore.availableModels = models;
      render(<ModelPicker />);
      await user.click(screen.getByTitle("Add all"));
      expect(mockAddSelectedModels).toHaveBeenCalledWith(models);
    });

    it("enables 'Remove all' when selected models exist", () => {
      mockSettingsStore.selectedModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      const removeAllBtn = screen.getByTitle("Remove all");
      expect(removeAllBtn).not.toBeDisabled();
    });

    it("calls setSelectedModels with empty array when clicking Remove all", async () => {
      const user = userEvent.setup();
      mockSettingsStore.selectedModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      await user.click(screen.getByTitle("Remove all"));
      expect(mockSetSelectedModels).toHaveBeenCalledWith([]);
    });
  });

  // -------------------------------------------------------------------------
  // Item selection
  // -------------------------------------------------------------------------

  describe("item selection", () => {
    it("selects a model in the left panel on click", async () => {
      const user = userEvent.setup();
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      // Click the model item
      await user.click(screen.getByText("Claude 1"));

      // After selecting, the "Add selected" button should be enabled
      // We can verify this by clicking "Add selected"
      const addSelectedBtn = screen.getByTitle("Add selected");
      expect(addSelectedBtn).not.toBeDisabled();
    });

    it("transfers selected model from left to right on Add selected click", async () => {
      const user = userEvent.setup();
      const models = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
        { id: "gpt-1", name: "GPT 1", provider: "openai" },
      ];
      mockSettingsStore.availableModels = models;
      render(<ModelPicker />);

      // Select a model
      await user.click(screen.getByText("Claude 1"));
      // Click add selected
      await user.click(screen.getByTitle("Add selected"));
      expect(mockAddSelectedModels).toHaveBeenCalledWith([models[0]]);
    });

    it("selects a model in the right panel on click", async () => {
      const user = userEvent.setup();
      mockSettingsStore.selectedModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      await user.click(screen.getByText("Claude 1"));

      const removeSelectedBtn = screen.getByTitle("Remove selected");
      expect(removeSelectedBtn).not.toBeDisabled();
    });

    it("transfers selected model from right on Remove selected click", async () => {
      const user = userEvent.setup();
      mockSettingsStore.selectedModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      await user.click(screen.getByText("Claude 1"));
      await user.click(screen.getByTitle("Remove selected"));
      expect(mockRemoveSelectedModels).toHaveBeenCalledWith(["claude-1"]);
    });

    it("deselects a model on second click (toggle)", async () => {
      const user = userEvent.setup();
      mockSettingsStore.availableModels = [
        { id: "claude-1", name: "Claude 1", provider: "anthropic" },
      ];
      render(<ModelPicker />);
      const item = screen.getByText("Claude 1");
      await user.click(item); // select
      await user.click(item); // deselect
      // "Add selected" should be disabled again
      expect(screen.getByTitle("Add selected")).toBeDisabled();
    });
  });
});
