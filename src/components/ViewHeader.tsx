import { useState } from "react";
import { Globe2, LoaderCircle, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { RequestTabsMenu } from "@/components/RequestTabsMenu";
import { TabScrollStrip } from "@/components/TabScrollStrip";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { useApp } from "@/machines";
import { methodShortLabel, methodTextClass } from "@/lib/method-colors";
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
    const showTabsMenu = tabs.length > 1 || tabsOverflowing;

    return (
      <header className="view-header flex h-11 shrink-0 items-stretch overflow-hidden">
        {/* Explorer toggle */}
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
            className="explorer-hide-btn mx-1 size-8 shrink-0 self-center text-topbar-muted hover:text-topbar-foreground"
            label="Hide explorer (⌘B)"
            onClick={toggleExplorerCollapsed}
          >
            <PanelLeftClose className="size-4" />
          </TooltipIconButton>
        )}

        {/* Tab strip */}
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
                  "request-tab group",
                  active ? "request-tab--active" : "request-tab--idle",
                )}
              >
                {/* active bottom indicator */}
                {active && <span className="request-tab__indicator" aria-hidden />}

                <button
                  type="button"
                  className="request-tab__body"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {pending ? (
                    <LoaderCircle className="size-3 shrink-0 animate-spin text-primary" />
                  ) : (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[10px] font-bold tabular-nums",
                        active
                          ? methodTextClass(tab.request.method)
                          : "text-topbar-muted group-hover:text-topbar-foreground/70",
                      )}
                    >
                      {methodShortLabel(tab.request.method)}
                    </span>
                  )}
                  {hasOverride && tabEnv && (
                    <TooltipWrap label={`Environment override: ${tabEnv.name}`}>
                      <Globe2 className="size-3 shrink-0 text-primary" aria-hidden />
                    </TooltipWrap>
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-[13px]",
                      active ? "text-topbar-foreground" : "text-topbar-muted",
                    )}
                  >
                    {tab.request.name}
                  </span>
                </button>

                {/* close */}
                <button
                  type="button"
                  aria-label="Close tab"
                  className={cn(
                    "request-tab__close",
                    active
                      ? "opacity-50 hover:opacity-100"
                      : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </TabScrollStrip>

        {/* trailing actions */}
        <div className="flex shrink-0 items-center gap-0.5 border-l border-topbar-border/60 px-2">
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
            label="New request tab (⌘T)"
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
