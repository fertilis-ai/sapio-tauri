import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Regression guard for the "only line numbers show" bug.
 *
 * The Workspace and Toolbox editors layer a transparent <textarea> over a Shiki
 * HTML overlay, so the overlay is normally the only visible text layer. When
 * highlighting failed (e.g. the packaged app's CSP blocking Shiki's WASM regex
 * engine) the overlay stayed empty and the panels rendered nothing but their
 * line-number gutter.
 *
 * These tests force `highlightCode` to reject and assert that the editors still
 * show their content.
 */

const { highlightCode } = vi.hoisted(() => ({ highlightCode: vi.fn() }));

vi.mock("@/lib/highlighter", () => ({
  highlightCode,
  escapeHtml: (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;"),
}));

const mockOpenFile = {
  path: "/notes.ts",
  originalContent: "const a = 1;",
  currentContent: "const a = 1;",
  isModified: false,
  language: "typescript",
};

const mockFileStore = {
  activeFilePath: "/notes.ts" as string | null,
  openFiles: [mockOpenFile],
  updateFileContent: vi.fn(),
};

vi.mock("@/stores/file-store", () => ({
  useFileStore: () => mockFileStore,
}));

const mockOpenItem = {
  category: "prompts" as const,
  name: "My Prompt",
  originalContent: "hello: world",
  currentContent: "hello: world",
  isModified: false,
};

const mockToolboxStore = {
  openItems: [mockOpenItem],
  activeItemKey: "prompts/My Prompt" as string | null,
  updateItem: vi.fn().mockResolvedValue(undefined),
  updateOpenItemContent: vi.fn(),
  markOpenItemSaved: vi.fn(),
};

vi.mock("@/stores/toolbox-store", () => ({
  useToolboxStore: () => mockToolboxStore,
  itemKey: (category: string, name: string) => `${category}/${name}`,
}));

vi.mock("@/components/toolbox/toolbox-tabs", () => ({
  ToolboxTabs: () => <div data-testid="toolbox-tabs">Tabs</div>,
}));

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "__esModule") return true;
        if (typeof name === "symbol" || name === "then") return undefined;
        return (props: any) => <div data-testid={`icon-${String(name)}`} {...props} />;
      },
      has: () => true,
    }
  )
);

import { FileEditor } from "./files/file-editor";
import { ToolboxEditor } from "./toolbox/toolbox-editor";

const EDITORS = [
  { name: "FileEditor", Component: FileEditor, content: "const a = 1;" },
  { name: "ToolboxEditor", Component: ToolboxEditor, content: "hello: world" },
];

describe("editor text survives highlighter failure", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  for (const { name, Component, content } of EDITORS) {
    describe(name, () => {
      it("keeps the textarea text visible when highlighting rejects", async () => {
        highlightCode.mockRejectedValue(new Error("wasm blocked by CSP"));

        const { container } = render(<Component />);
        const textarea = screen.getByRole("textbox");

        // The textarea must never be the sole (invisible) text layer.
        expect(textarea).not.toHaveClass("text-transparent");
        expect(textarea).toHaveValue(content);

        // Once the rejection is handled, a plaintext overlay takes over and the
        // textarea can safely go transparent again.
        await waitFor(() => {
          expect(textarea).toHaveClass("text-transparent");
        });
        expect(container.querySelector("pre code")).toHaveTextContent(content);
      });

      it("falls back to plaintext when the language is unsupported", async () => {
        highlightCode.mockResolvedValue(null);

        const { container } = render(<Component />);

        await waitFor(() => {
          expect(container.querySelector("pre code")).toHaveTextContent(content);
        });
      });

      it("hides the textarea text only once the overlay has content", async () => {
        highlightCode.mockResolvedValue("<pre><code>highlighted</code></pre>");

        render(<Component />);
        const textarea = screen.getByRole("textbox");

        await waitFor(() => {
          expect(textarea).toHaveClass("text-transparent");
        });
      });

      it("keeps the gutter and the code on the same line-height", async () => {
        highlightCode.mockResolvedValue("<pre><code>highlighted</code></pre>");

        const { container } = render(<Component />);
        await waitFor(() => {
          expect(screen.getByRole("textbox")).toHaveClass("text-transparent");
        });

        // Gutter numbers drift out of alignment with the code if these differ.
        expect(screen.getByText("1")).toHaveClass("leading-5");
        expect(screen.getByRole("textbox")).toHaveClass("leading-5");
        expect(container.querySelector("[class*='_code']")).toHaveClass(
          "[&_code]:leading-5",
        );
      });
    });
  }
});
