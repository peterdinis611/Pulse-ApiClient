import { Plus, X } from "lucide-react";
import { useApp } from "@/machines";
import { MethodBadge } from "@/components/MethodBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RequestTabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, newRequestTab, mainView, setMainView } =
    useApp();

  return (
    <div className="flex items-end gap-0 overflow-x-auto border-b border-border bg-muted/40 px-2 pt-2">
      <button
        type="button"
        onClick={() => setMainView("overview")}
        className={cn(
          "mr-1 flex h-9 items-center gap-2 rounded-t-md border border-transparent px-3 text-sm transition-colors",
          mainView === "overview"
            ? "border-border border-b-background bg-background text-foreground"
            : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
        )}
      >
        Overview
      </button>

      {tabs.map((tab) => {
        const active = mainView === "request" && tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex h-9 min-w-[140px] max-w-[220px] items-center rounded-t-md border border-transparent",
              active
                ? "border-border border-b-background bg-background text-foreground"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm"
              onClick={() => setActiveTab(tab.id)}
            >
              <MethodBadge method={tab.request.method} />
              <span className="truncate">{tab.request.name}</span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mr-1 size-6 opacity-0 group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mb-1 size-8 shrink-0"
        onClick={newRequestTab}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
