import * as React from "react";
import { Wrench, Play, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useToolboxStore, itemKey, type ToolboxCategory } from "@/stores/toolbox-store";
import { ToolboxTabs } from "./toolbox-tabs";
import { highlightCode, escapeHtml } from "@/lib/highlighter";
import { runWorkflowByName } from "@/lib/workflows/run-workflow";
import { validateToolboxContent } from "@/lib/toolbox/toolbox-schemas";
import { cn } from "@/lib/utils";

// Map category to language for syntax highlighting
function getLanguage(category: ToolboxCategory): string {
  switch (category) {
    case "prompts":
      return "yaml";
    case "memories":
      return "markdown";
    case "agents":
      return "markdown";
    case "skills":
      return "markdown";
    case "workflows":
      return "yaml";
    default:
      return "text";
  }
}

export function ToolboxEditor() {
  const { openItems, activeItemKey, updateItem, updateOpenItemContent, markOpenItemSaved } =
    useToolboxStore();
  const [highlightedHtml, setHighlightedHtml] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);

  const activeItem = openItems.find(
    (i) => itemKey(i.category, i.name) === activeItemKey
  );
  const hasOpenItems = openItems.length > 0;

  // Update syntax highlighting when content or category changes
  React.useEffect(() => {
    if (!activeItem) {
      setHighlightedHtml("");
      return;
    }

    let cancelled = false;
    const lang = getLanguage(activeItem.category);

    const plain = `<pre><code>${escapeHtml(activeItem.currentContent)}</code></pre>`;

    highlightCode(activeItem.currentContent, lang)
      .then((html) => {
        if (cancelled) return;
        setHighlightedHtml(html ?? plain);
      })
      .catch((error: unknown) => {
        // The overlay is the only visible text layer, so a swallowed failure
        // would leave the editor showing nothing but line numbers.
        console.warn("[toolbox-editor] Syntax highlighting failed:", error);
        if (cancelled) return;
        setHighlightedHtml(plain);
      });

    return () => {
      cancelled = true;
    };
  }, [activeItem?.currentContent, activeItem?.category]);

  // Same schema contract the agent's tools enforce, but advisory here: a
  // human can always save (warn-but-allow), the agent's writes are rejected.
  const validation = React.useMemo(() => {
    if (!activeItem) return null;
    return validateToolboxContent(activeItem.category, activeItem.currentContent);
  }, [activeItem]);

  const handleSave = async () => {
    if (activeItem) {
      await updateItem(activeItem.category, activeItem.name, activeItem.currentContent);
      markOpenItemSaved(activeItem.category, activeItem.name, activeItem.currentContent);
    }
  };

  const handleRunWorkflow = async () => {
    if (!activeItem || activeItem.category !== "workflows" || isRunning) return;
    // Persist any unsaved edits so the run uses the current content.
    if (activeItem.isModified) await handleSave();
    setIsRunning(true);
    const name = activeItem.name;
    toast(`Running workflow "${name}"…`);
    try {
      const result = await runWorkflowByName(name);
      if (result.error) {
        toast.error(`Workflow "${name}" failed: ${result.error}`);
      } else {
        toast.success(`Workflow "${name}" completed (${result.stepOutputs.length} steps).`);
      }
    } catch (error) {
      toast.error(`Workflow "${name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Sync scroll between textarea, line numbers, and highlight overlay
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollLeft = e.currentTarget.scrollLeft;

    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
  };

  const content = activeItem?.currentContent ?? "";
  const lineCount = content.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {hasOpenItems ? (
        <ToolboxTabs />
      ) : (
        <div className="flex h-10 items-center border-b border-border px-2 bg-sidebar">
          <span className="text-sm font-medium">Toolbox</span>
        </div>
      )}

      {!activeItem ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Wrench className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium">No item selected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Select an item from the sidebar to edit
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
        {validation && !validation.ok && (
          <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{validation.error} (saving is still allowed)</span>
          </div>
        )}
        {activeItem.category === "workflows" && (
          <div className="flex items-center justify-end gap-2 border-b border-border/50 px-3 py-1.5">
            <button
              type="button"
              onClick={handleRunWorkflow}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {isRunning ? "Running…" : "Run workflow"}
            </button>
          </div>
        )}
        <div className="flex flex-1 overflow-hidden font-mono text-sm">
          {/* Line numbers */}
          <div
            ref={lineNumbersRef}
            className="flex-shrink-0 select-none overflow-hidden bg-muted/30 text-muted-foreground text-right pr-2 pl-2 py-4"
            style={{ minWidth: `${String(lineCount).length + 2}ch` }}
          >
            {lineNumbers.map((num) => (
              <div key={num} className="leading-5">
                {num}
              </div>
            ))}
          </div>

          {/* Editor area with overlay */}
          <div className="relative flex-1 overflow-hidden">
            {/* Syntax highlighted overlay */}
            <div
              ref={highlightRef}
              className="absolute inset-0 overflow-hidden pointer-events-none p-4 [&_pre]:!bg-transparent [&_pre]:m-0 [&_pre]:p-0 [&_span]:!bg-transparent [&_code]:leading-5 [&_code]:whitespace-pre"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />

            {/* Transparent textarea for input */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                if (activeItem) {
                  updateOpenItemContent(activeItem.category, activeItem.name, e.target.value);
                }
              }}
              onScroll={handleScroll}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault();
                  handleSave();
                }
                // Tab key inserts 2 spaces
                if (e.key === "Tab") {
                  e.preventDefault();
                  const textarea = e.currentTarget;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;
                  const newValue =
                    `${content.substring(0, start)}  ${content.substring(end)}`;
                  if (activeItem) {
                    updateOpenItemContent(activeItem.category, activeItem.name, newValue);
                  }
                  requestAnimationFrame(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 2;
                  });
                }
              }}
              wrap="off"
              className={cn(
                // `leading-5` must stay after `text-sm`: tailwind-merge drops a
                // preceding `leading-*` because text-size utilities also set
                // line-height, and the overlay depends on the two matching.
                "relative z-10 h-full w-full resize-none bg-transparent p-4 focus:outline-none caret-foreground selection:bg-primary/30 font-mono text-sm leading-5 overflow-x-auto",
                // Only hide the textarea's own text once the overlay actually
                // has something to show in its place.
                highlightedHtml ? "text-transparent" : "text-foreground",
              )}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
