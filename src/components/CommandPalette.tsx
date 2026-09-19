import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  FolderOpen,
  Globe2,
  LayoutGrid,
  Search,
  Send,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { useApp } from "@/machines";
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
  type CommandPaletteItem,
} from "@/lib/command-palette";
import { navigatePulse } from "@/lib/app-navigate";
import { requestProductTour, requestWhatsNew } from "@/lib/whats-new";
import { requestOnboarding } from "@/lib/onboarding";
import { formatModShortcut, PULSE_HOTKEYS } from "@/lib/hotkeys";
import { methodTextClass } from "@/lib/method-colors";
import { cn } from "@/lib/utils";

function kindIcon(item: CommandPaletteItem) {
  switch (item.kind) {
    case "request":
      return Send;
    case "collection":
      return FolderOpen;
    case "environment":
      return Globe2;
    case "settings":
      return Settings;
    case "docs":
      return BookOpen;
    case "action":
      return Sparkles;
    default:
      return LayoutGrid;
  }
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    collections,
    collectionGroups,
    environments,
    loadSavedRequest,
    setMainView,
    setActiveCollectionId,
    setActiveEnvironmentId,
    newRequestTab,
    toggleExplorerCollapsed,
    setConsoleOpen,
    consoleOpen,
  } = useApp();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => buildCommandPaletteItems({ collections, collectionGroups, environments }),
    [collectionGroups, collections, environments],
  );
  const results = useMemo(() => filterCommandPaletteItems(items, query), [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-palette-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const run = (item: CommandPaletteItem) => {
    if (item.kind === "request" && item.savedRequestId) {
      const saved = collections.find((entry) => entry.id === item.savedRequestId);
      if (saved) loadSavedRequest(saved);
    } else if (item.kind === "collection" && item.collectionId) {
      setActiveCollectionId(item.collectionId);
      setMainView("request");
    } else if (item.kind === "environment" && item.environmentId) {
      setActiveEnvironmentId(item.environmentId);
      setMainView("environments");
    } else if (item.kind === "action") {
      if (item.action === "new-request") newRequestTab();
      if (item.action === "toggle-explorer") toggleExplorerCollapsed();
      if (item.action === "toggle-console") setConsoleOpen(!consoleOpen);
      if (item.action === "whats-new") requestWhatsNew();
      if (item.action === "product-tour") requestProductTour();
      if (item.action === "onboarding") requestOnboarding();
    } else if (item.view) {
      setMainView(item.view);
      if (item.settingsSection || item.docsSection) {
        window.setTimeout(() => {
          navigatePulse({
            view: item.view,
            settingsSection: item.settingsSection,
            docsSection: item.docsSection,
          });
        }, 40);
      }
    }
    onOpenChange(false);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-background/70 backdrop-blur-[3px]"
        aria-label="Close command palette"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-[81] flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const item = results[activeIndex];
                if (item) run(item);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onOpenChange(false);
              }
            }}
            placeholder="Jump to a request, collection, setting, or docs…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="ui-kbd">{formatModShortcut(PULSE_HOTKEYS.commandPalette)}</kbd>
        </div>
        <div ref={listRef} className="max-h-[min(420px,50vh)] overflow-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing matches.</p>
          )}
          {results.map((item, index) => {
            const Icon = kindIcon(item);
            const active = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                data-palette-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => run(item)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left",
                  active ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md",
                    active ? "bg-primary/15 text-primary" : "bg-muted/70",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {item.method ? (
                      <span className={cn("font-mono text-[10px] font-bold", methodTextClass(item.method))}>
                        {item.method}
                      </span>
                    ) : null}
                    <span className="truncate text-[13px] font-medium text-foreground">{item.title}</span>
                  </span>
                  <span className="block truncate text-[12px]">{item.subtitle}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {item.meta}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
          <Zap className="size-3" />
          Jump anywhere in Pulse. Type to search requests and the field manual.
        </div>
      </div>
    </div>,
    document.body,
  );
}
