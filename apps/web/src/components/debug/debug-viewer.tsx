import * as React from "react";
import { Bug, Trash2, RefreshCw } from "lucide-react";
import { useDebugStore } from "@/stores/debug-store";

export function DebugViewer() {
  const { selectedFile, fileContent, isLoading, error, refreshContent, clearSelectedFile } =
    useDebugStore();

  // Auto-refresh every 3 seconds when a file is selected
  React.useEffect(() => {
    if (!selectedFile) return;
    const interval = setInterval(refreshContent, 3000);
    return () => clearInterval(interval);
  }, [selectedFile, refreshContent]);

  if (!selectedFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Bug className="h-10 w-10" />
        <p className="text-sm">No log file selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">{selectedFile}</span>
          <button
            onClick={refreshContent}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          onClick={clearSelectedFile}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title="Clear logs"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to read log file: {error}</p>
        ) : fileContent ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
            {fileContent}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">Log file is empty</p>
        )}
      </div>
    </div>
  );
}
