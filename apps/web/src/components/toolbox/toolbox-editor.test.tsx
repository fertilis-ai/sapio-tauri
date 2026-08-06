import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockOpenItem = {
  category: "prompts" as const,
  name: "My Prompt",
  originalContent: "original content",
  currentContent: "current content",
  isModified: true,
};

const mockToolboxStore = {
  openItems: [mockOpenItem],
  activeItemKey: "prompts/My Prompt" as string | null,
  updateItem: vi.fn().mockResolvedValue(undefined),
  updateOpenItemContent: vi.fn(),
  markOpenItemSaved: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/stores/toolbox-store", () => ({
  useToolboxStore: () => mockToolboxStore,
  itemKey: (category: string, name: string) => `${category}/${name}`,
}));

vi.mock("./toolbox-tabs", () => ({
  ToolboxTabs: () => <div data-testid="toolbox-tabs">Tabs</div>,
}));

vi.mock("shiki", () => ({
  createHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: vi.fn(() => '<pre><code>highlighted</code></pre>'),
    getLoadedLanguages: vi.fn(() => []),
    loadLanguage: vi.fn().mockResolvedValue(undefined),
  }),
  bundledLanguages: { yaml: {}, markdown: {}, text: {} },
}));

vi.mock("@shikijs/engine-javascript", () => ({
  createJavaScriptRegexEngine: vi.fn(() => ({})),
}));

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "__esModule") return true;
        if (typeof name === "symbol" || name === "then") return undefined;
        return (props: any) => (
          <div data-testid={`icon-${String(name)}`} {...props} />
        );
      },
      has: () => true,
    }
  )
);

import { ToolboxEditor } from "./toolbox-editor";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ToolboxEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToolboxStore.openItems = [mockOpenItem];
    mockToolboxStore.activeItemKey = "prompts/My Prompt";
  });

  // -------------------------------------------------------------------------
  // Rendering - with active item
  // -------------------------------------------------------------------------

  describe("with active item", () => {
    it("renders the tabs component when items are open", () => {
      render(<ToolboxEditor />);
      expect(screen.getByTestId("toolbox-tabs")).toBeInTheDocument();
    });

    it("renders the textarea with content", () => {
      render(<ToolboxEditor />);
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveValue("current content");
    });

    it("renders line numbers", () => {
      render(<ToolboxEditor />);
      // "current content" is one line, so line number 1 should appear
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("renders line numbers for multi-line content", () => {
      mockToolboxStore.openItems = [
        { ...mockOpenItem, currentContent: "line1\nline2\nline3" },
      ];
      render(<ToolboxEditor />);
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Rendering - no active item
  // -------------------------------------------------------------------------

  describe("without active item", () => {
    it("shows empty state when no item is selected", () => {
      mockToolboxStore.openItems = [];
      mockToolboxStore.activeItemKey = null;
      render(<ToolboxEditor />);
      expect(screen.getByText("No item selected")).toBeInTheDocument();
      expect(screen.getByText("Select an item from the sidebar to edit")).toBeInTheDocument();
    });

    it("shows Wrench icon in empty state", () => {
      mockToolboxStore.openItems = [];
      mockToolboxStore.activeItemKey = null;
      render(<ToolboxEditor />);
      expect(screen.getByTestId("icon-Wrench")).toBeInTheDocument();
    });

    it("shows the header bar (not tabs) when no items are open", () => {
      mockToolboxStore.openItems = [];
      mockToolboxStore.activeItemKey = null;
      render(<ToolboxEditor />);
      expect(screen.getByText("Toolbox")).toBeInTheDocument();
      expect(screen.queryByTestId("toolbox-tabs")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Content editing
  // -------------------------------------------------------------------------

  describe("content editing", () => {
    it("calls updateOpenItemContent on textarea change", () => {
      render(<ToolboxEditor />);
      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "new content" } });
      expect(mockToolboxStore.updateOpenItemContent).toHaveBeenCalledWith(
        "prompts",
        "My Prompt",
        "new content"
      );
    });

    it("saves on Meta+S (Cmd+S on macOS)", () => {
      render(<ToolboxEditor />);
      const textarea = screen.getByRole("textbox");
      fireEvent.keyDown(textarea, { key: "s", metaKey: true });
      expect(mockToolboxStore.updateItem).toHaveBeenCalledWith(
        "prompts",
        "My Prompt",
        "current content"
      );
    });

    it("inserts two spaces when Tab key is pressed", () => {
      render(<ToolboxEditor />);
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      // Set selection to position 0
      Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
      Object.defineProperty(textarea, "selectionEnd", { value: 0, writable: true });

      fireEvent.keyDown(textarea, { key: "Tab" });

      expect(mockToolboxStore.updateOpenItemContent).toHaveBeenCalledWith(
        "prompts",
        "My Prompt",
        "  current content"
      );
    });
  });

  // -------------------------------------------------------------------------
  // activeItemKey mismatch (item not found)
  // -------------------------------------------------------------------------

  describe("active key mismatch", () => {
    it("shows empty state when activeItemKey does not match any open item", () => {
      mockToolboxStore.activeItemKey = "agents/Nonexistent";
      render(<ToolboxEditor />);
      expect(screen.getByText("No item selected")).toBeInTheDocument();
    });
  });
});
