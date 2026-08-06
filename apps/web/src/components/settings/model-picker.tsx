import * as React from "react";
import { ChevronRight, ChevronDown, ChevronsRight, ChevronsLeft, ChevronRightIcon, ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import type { ProviderModel } from "@/lib/models";

const providerDisplayName: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  openrouter: "OpenRouter",
};

/**
 * Only OpenRouter models carry `zdr`, and a failed ZDR fetch degrades to "untagged"
 * (provider-models.ts fetchZdrModelIds) — so absence means unknown, not "retains data".
 * Badge the confirmed positive only; never imply the negative.
 */
function ZdrBadge({ model, className }: { model: ProviderModel; className?: string }) {
  if (!model.zdr) return null;
  return (
    <span
      className={cn("shrink-0 text-[10px] font-medium text-green-600 dark:text-green-400", className)}
      title="Zero data retention — served by endpoints that don't store your prompts"
    >
      ZDR
    </span>
  );
}

/** Group models by provider */
function groupByProvider(models: ProviderModel[]): Record<string, ProviderModel[]> {
  const groups: Record<string, ProviderModel[]> = {};
  for (const m of models) {
    (groups[m.provider] ??= []).push(m);
  }
  return groups;
}

function matchesSearch(model: ProviderModel, query: string): boolean {
  const q = query.toLowerCase();
  return model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q);
}

export function ModelPicker() {
  const {
    availableModels,
    selectedModels,
    addSelectedModels,
    removeSelectedModels,
    setSelectedModels,
    modelDiscoveryNoDataCollection,
  } = useSettingsStore();

  const [leftSearch, setLeftSearch] = React.useState("");
  const [rightSearch, setRightSearch] = React.useState("");
  const [leftSelected, setLeftSelected] = React.useState<Set<string>>(new Set());
  const [rightSelected, setRightSelected] = React.useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  // Available = fetched minus already selected
  const selectedIds = React.useMemo(() => new Set(selectedModels.map((m) => m.id)), [selectedModels]);
  const availableFiltered = React.useMemo(() => {
    return availableModels
      .filter((m) => !selectedIds.has(m.id))
      .filter((m) => !modelDiscoveryNoDataCollection || m.provider !== "openrouter" || m.zdr)
      .filter((m) => !leftSearch || matchesSearch(m, leftSearch));
  }, [availableModels, selectedIds, leftSearch, modelDiscoveryNoDataCollection]);

  const selectedFiltered = React.useMemo(() => {
    return selectedModels.filter((m) => !rightSearch || matchesSearch(m, rightSearch));
  }, [selectedModels, rightSearch]);

  const availableGroups = React.useMemo(() => groupByProvider(availableFiltered), [availableFiltered]);

  const toggleGroup = (provider: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const toggleLeftItem = (id: string, e: React.MouseEvent) => {
    setLeftSelected((prev) => {
      const next = new Set(prev);
      if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) next.clear();
        else {
          next.clear();
          next.add(id);
        }
      }
      return next;
    });
  };

  const toggleRightItem = (id: string, e: React.MouseEvent) => {
    setRightSelected((prev) => {
      const next = new Set(prev);
      if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) next.clear();
        else {
          next.clear();
          next.add(id);
        }
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const toAdd = availableModels.filter((m) => leftSelected.has(m.id));
    if (toAdd.length > 0) {
      addSelectedModels(toAdd);
      setLeftSelected(new Set());
    }
  };

  const handleRemoveSelected = () => {
    const ids = [...rightSelected];
    if (ids.length > 0) {
      removeSelectedModels(ids);
      setRightSelected(new Set());
    }
  };

  const handleAddAll = () => {
    addSelectedModels(availableFiltered);
    setLeftSelected(new Set());
  };

  const handleRemoveAll = () => {
    setSelectedModels([]);
    setRightSelected(new Set());
  };

  const providerOrder = Object.keys(availableGroups).sort();

  return (
    <div className="space-y-3">
      {/* Dual listbox */}
      <div className="flex w-full gap-2 items-stretch">
        {/* Left panel — available */}
        <div className="flex-1 min-w-0 rounded-md border border-border">
          <div className="border-b border-border px-2 py-1.5">
            <div className="text-xs font-medium text-muted-foreground mb-1">Available Models</div>
            <Input
              placeholder="Filter..."
              value={leftSearch}
              onChange={(e) => setLeftSearch(e.target.value)}
              className="h-7"
            />
          </div>
          <div className="h-64 overflow-auto p-1">
            {providerOrder.length === 0 && (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                {availableModels.length === 0
                  ? "Click Refresh to fetch models"
                  : "All models selected"}
              </div>
            )}
            {providerOrder.map((provider) => {
              const models = availableGroups[provider];
              const isCollapsed = collapsedGroups.has(provider);
              return (
                <div key={provider}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(provider)}
                    className="flex w-full items-center gap-1 px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    <span>{providerDisplayName[provider] ?? provider}</span>
                    <span className="ml-auto text-[10px]">({models.length})</span>
                  </button>
                  {!isCollapsed &&
                    models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={(e) => toggleLeftItem(m.id, e)}
                        className={`flex w-full items-center gap-2 truncate rounded px-4 py-0.5 text-left text-xs ${
                          leftSelected.has(m.id)
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                        title={m.id}
                      >
                        <span className="truncate">{m.name !== m.id ? m.name : m.id}</span>
                        <ZdrBadge model={m} className="ml-auto" />
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Transfer buttons */}
        <div className="flex flex-col justify-center gap-1">
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handleAddAll}
            disabled={availableFiltered.length === 0}
            title="Add all"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handleAddSelected}
            disabled={leftSelected.size === 0}
            title="Add selected"
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handleRemoveSelected}
            disabled={rightSelected.size === 0}
            title="Remove selected"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handleRemoveAll}
            disabled={selectedModels.length === 0}
            title="Remove all"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Right panel — selected */}
        <div className="flex-1 min-w-0 rounded-md border border-border">
          <div className="border-b border-border px-2 py-1.5">
            <div className="text-xs font-medium text-muted-foreground mb-1">Selected Models</div>
            <Input
              placeholder="Filter..."
              value={rightSearch}
              onChange={(e) => setRightSearch(e.target.value)}
              className="h-7"
            />
          </div>
          <div className="h-64 overflow-auto p-1">
            {selectedFiltered.length === 0 && (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                {selectedModels.length === 0
                  ? "No models selected (using defaults)"
                  : "No matches"}
              </div>
            )}
            {selectedFiltered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={(e) => toggleRightItem(m.id, e)}
                className={`flex w-full items-center gap-2 truncate rounded px-2 py-0.5 text-left text-xs ${
                  rightSelected.has(m.id)
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
                title={m.id}
              >
                <span className="truncate">{m.name !== m.id ? m.name : m.id}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <ZdrBadge model={m} />
                  <span className="text-[10px] text-muted-foreground">{providerDisplayName[m.provider] ?? m.provider}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Selected models appear in the model dropdowns. If none are selected, built-in defaults are used.
        Use Ctrl/Cmd+click to select multiple items.
      </p>
    </div>
  );
}
