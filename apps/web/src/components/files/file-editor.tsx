import * as React from "react";
import { useFileStore } from "@/stores/file-store";
import { highlightCode, escapeHtml } from "@/lib/highlighter";
import { cn } from "@/lib/utils";

export function FileEditor() {
  const { activeFilePath, openFiles, updateFileContent } = useFileStore();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);

  const [highlightedHtml, setHighlightedHtml] = React.useState("");

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const content = activeFile?.currentContent ?? "";

  const lineCount = content.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Update syntax highlighting when content or language changes
  React.useEffect(() => {
    if (!activeFile) {
      setHighlightedHtml("");
      return;
    }

    let cancelled = false;

    const plain = `<pre><code>${escapeHtml(content)}</code></pre>`;

    highlightCode(content, activeFile.language)
      .then((html) => {
        if (cancelled) return;
        setHighlightedHtml(html ?? plain);
      })
      .catch((error: unknown) => {
        // The overlay is the only visible text layer, so a swallowed failure
        // would leave the editor showing nothing but line numbers.
        console.warn("[file-editor] Syntax highlighting failed:", error);
        if (cancelled) return;
        setHighlightedHtml(plain);
      });

    return () => {
      cancelled = true;
    };
  }, [content, activeFile?.language]);

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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeFilePath) {
      updateFileContent(activeFilePath, e.target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key inserts 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newValue =
        `${content.substring(0, start)}  ${content.substring(end)}`;

      if (activeFilePath) {
        updateFileContent(activeFilePath, newValue);
      }

      // Restore cursor position after state update
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  if (!activeFilePath || !activeFile) {
    return null;
  }

  return (
    <div className="flex h-full font-mono text-sm">
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
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          wrap="off"
          className={cn(
            // `leading-5` must stay after `text-sm`: tailwind-merge drops a
            // preceding `leading-*` because text-size utilities also set
            // line-height, and the overlay depends on the two matching.
            "relative z-10 h-full w-full resize-none bg-transparent p-4 focus:outline-none caret-foreground selection:bg-primary/30 font-mono text-sm leading-5 overflow-x-auto",
            // Only hide the textarea's own text once the overlay actually has
            // something to show in its place.
            highlightedHtml ? "text-transparent" : "text-foreground",
          )}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
    </div>
  );
}
