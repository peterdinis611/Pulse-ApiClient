import { useState } from "react";
import { AppWindow, Globe2, LoaderCircle, PanelLeft, Plus, X } from "lucide-react";
import { RequestTabsMenu } from "@/components/RequestTabsMenu";
import { TabScrollStrip } from "@/components/TabScrollStrip";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { MethodBadge } from "@/components/MethodBadge";
import { useApp } from "@/machines";
import { openRequestInNewWindow } from "@/lib/window-manager";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function WorkspaceHeader() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    newRequestTab,
    mainView,
    explorerCollapsed,
    toggleExplorerCollapsed,
    activeEnvironmentId,
    environments,
  } = useApp();

  const [tabsOverflowing, setTabsOverflowing] = useState(false);

  if (mainView !== "request") return null;

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

  const showTabsMenu = tabs.length > 1 || tabsOverflowing;

  return (
    <header className="flex h-9 shrink-0 items-stretch overflow-hidden border-b border-border bg-background">
      <TabScrollStrip
        activeItemId={activeTabId}
        onOverflowChange={setTabsOverflowing}
        className="min-w-0"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const pending = tab.loading;
          const tabEnvId = tab.environmentId ?? activeEnvironmentId;
          const tabEnv = environments.find((env) => env.id === tabEnvId);
          const hasOverride =
            tab.environmentId != null && tab.environmentId !== activeEnvironmentId;

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={cn(
                "group relative flex h-9 max-w-[200px] min-w-[88px] shrink-0 items-stretch",
                active
                  ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left text-[13px]"
                onClick={() => setActiveTab(tab.id)}
              >
                <MethodBadge method={tab.request.method} />
                {pending && <LoaderCircle className="size-3 shrink-0 animate-spin" />}
                {hasOverride && tabEnv && (
                  <TooltipWrap label={`Environment: ${tabEnv.name}`}>
                    <Globe2 className="size-3 shrink-0 text-primary" aria-hidden />
                  </TooltipWrap>
                )}
                <span className="truncate">{tab.request.name}</span>
              </button>
              <TooltipIconButton
                variant="ghost"
                size="icon"
                className={cn(
                  "size-6 shrink-0",
                  active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                label="Open in new window"
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePopOut(tab.id);
                }}
              >
                <AppWindow className="size-3" />
              </TooltipIconButton>
              <TooltipIconButton
                variant="ghost"
                size="icon"
                className={cn(
                  "mr-1 size-6 shrink-0",
                  active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                label="Close tab"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <X className="size-3" />
              </TooltipIconButton>
            </div>
          );
        })}
      </TabScrollStrip>

      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/70 px-1.5">
        {showTabsMenu && (
          <RequestTabsMenu
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTab}
            onClose={closeTab}
            onNewTab={newRequestTab}
          />
        )}
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-7"
          label="New request tab"
          onClick={newRequestTab}
        >
          <Plus className="size-3.5" />
        </TooltipIconButton>
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className={cn("size-7", !explorerCollapsed && "bg-accent text-accent-foreground")}
          label={explorerCollapsed ? "Show explorer (⌘B)" : "Hide explorer (⌘B)"}
          onClick={toggleExplorerCollapsed}
        >
          <PanelLeft className="size-3.5" />
        </TooltipIconButton>
      </div>
    </header>
  );
}
