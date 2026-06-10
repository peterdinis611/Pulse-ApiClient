import { AppWindow, Globe2, LoaderCircle, Plus, X } from "lucide-react";
import { useApp } from "@/machines";
import { MethodBadge } from "@/components/MethodBadge";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { openRequestInNewWindow } from "@/lib/window-manager";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function RequestTabBar() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    newRequestTab,
    mainView,
    setMainView,
    activeEnvironmentId,
    environments,
  } = useApp();

  const handlePopOut = async (tabId: string) => {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;

    try {
      await openRequestInNewWindow(tab.request);
      toast.success("Opened in new window", tab.request.name);
    } catch {
      toast.error("Failed to open new window");
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-end gap-0 overflow-x-auto px-2 pt-2">
      <button
        type="button"
        onClick={() => setMainView("overview")}
        className={cn(
          "mr-1 flex h-9 items-center gap-2 rounded-t-lg border border-transparent px-3 text-sm font-medium transition-colors",
          mainView === "overview"
            ? "border-border/80 border-b-card bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
        )}
      >
        Overview
      </button>

      {tabs.map((tab) => {
        const active = mainView === "request" && tab.id === activeTabId;
        const pending = tab.loading;
        const tabEnvId = tab.environmentId ?? activeEnvironmentId;
        const tabEnv = environments.find((env) => env.id === tabEnvId);
        const hasOverride =
          tab.environmentId != null && tab.environmentId !== activeEnvironmentId;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex h-9 min-w-[140px] max-w-[260px] items-center rounded-t-lg border border-transparent",
              active
                ? "border-border/80 border-b-card bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm"
              onClick={() => setActiveTab(tab.id)}
            >
              <MethodBadge method={tab.request.method} />
              {pending && <LoaderCircle className="size-3.5 animate-spin" />}
              {hasOverride && tabEnv && (
                <TooltipWrap label={`Environment: ${tabEnv.name}`}>
                  <span className="inline-flex shrink-0">
                    <Globe2 className="size-3 text-primary" aria-hidden />
                  </span>
                </TooltipWrap>
              )}
              <span className="truncate">{tab.request.name}</span>
            </button>
            <TooltipIconButton
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 group-hover:opacity-100"
              label="Open in new window"
              onClick={(event) => {
                event.stopPropagation();
                void handlePopOut(tab.id);
              }}
            >
              <AppWindow className="size-3.5" />
            </TooltipIconButton>
            <TooltipIconButton
              variant="ghost"
              size="icon"
              className="mr-1 size-6 opacity-0 group-hover:opacity-100"
              label="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X className="size-3.5" />
            </TooltipIconButton>
          </div>
        );
      })}

      <TooltipIconButton
        variant="ghost"
        size="icon"
        className="mb-1 size-8 shrink-0"
        label="New request tab"
        onClick={newRequestTab}
      >
        <Plus className="size-4" />
      </TooltipIconButton>
    </div>
  );
}
