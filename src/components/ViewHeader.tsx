import { useState } from "react";
import { AppWindow, Globe2, LoaderCircle, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { RequestTabsMenu } from "@/components/RequestTabsMenu";
import { TabScrollStrip } from "@/components/TabScrollStrip";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { MethodBadge } from "@/components/MethodBadge";
import { useApp } from "@/machines";
import { openRequestInNewWindow } from "@/lib/window-manager";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const VIEW_META = {
  overview: {
    title: "Overview",
    description: "Recent requests and saved endpoints across your workspace.",
  },
  environments: {
    title: "Environments",
    description: "Variables for URLs, headers, auth, and bodies.",
  },
  settings: {
    title: "Settings",
    description: "Appearance, data, collections, and HTTP engine.",
  },
} as const;

export function ViewHeader() {
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

  if (mainView === "request") {
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
      <header className="view-header flex h-10 shrink-0 items-stretch overflow-hidden">
        {explorerCollapsed ? (
          <button
            type="button"
            className="explorer-show-btn group flex shrink-0 items-center gap-2 border-r border-topbar-border/60 px-3 text-[13px] font-medium text-topbar-foreground transition-colors hover:bg-topbar-foreground/8"
            aria-expanded={false}
            aria-controls="explorer-panel"
            onClick={toggleExplorerCollapsed}
          >
            <PanelLeftOpen className="size-4 text-primary transition-transform group-hover:scale-105" />
            <span>Explorer</span>
            <kbd className="explorer-kbd hidden xl:inline">⌘B</kbd>
          </button>
        ) : (
          <TooltipIconButton
            variant="ghost"
            size="icon"
            className="explorer-hide-btn mx-1 size-8 shrink-0 text-topbar-muted hover:text-topbar-foreground"
            label="Hide explorer (⌘B)"
            onClick={toggleExplorerCollapsed}
          >
            <PanelLeftClose className="size-4" />
          </TooltipIconButton>
        )}

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
                  "group relative mx-0.5 flex h-8 max-w-[220px] min-w-[88px] shrink-0 items-stretch rounded-lg",
                  active
                    ? "bg-background text-topbar-foreground shadow-sm ring-1 ring-border/60"
                    : "text-topbar-muted hover:bg-topbar-foreground/8 hover:text-topbar-foreground",
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
                    "size-6 shrink-0 text-topbar-muted hover:text-topbar-foreground",
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
                    "mr-1 size-6 shrink-0 text-topbar-muted hover:text-topbar-foreground",
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

        <div className="flex shrink-0 items-center gap-1 border-l border-topbar-border/60 px-2">
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
            className="size-7 text-topbar-muted hover:text-topbar-foreground"
            label="New request tab"
            onClick={newRequestTab}
          >
            <Plus className="size-3.5" />
          </TooltipIconButton>
        </div>
      </header>
    );
  }

  const meta = VIEW_META[mainView as keyof typeof VIEW_META];
  if (!meta) return null;

  return (
    <header className="view-header flex h-11 shrink-0 items-center gap-3 px-4 sm:px-5">
      <h1 className="text-title">{meta.title}</h1>
      <p className="hidden truncate text-body text-topbar-muted sm:block">{meta.description}</p>
    </header>
  );
}

/** @deprecated use ViewHeader */
export const WorkspaceHeader = ViewHeader;
