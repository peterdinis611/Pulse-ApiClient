import { AppWindow, Globe2, LoaderCircle, PanelLeft, Plus, X } from "lucide-react";
import { EnvironmentSwitcher } from "@/components/EnvironmentSwitcher";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { WindowMenu } from "@/components/WindowMenu";
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
    setMainView,
    explorerCollapsed,
    toggleExplorerCollapsed,
    activeEnvironmentId,
    environments,
    workspaceEnvironment,
    activeEnvironment,
    setActiveEnvironmentId,
    addEnvironment,
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
    <header className="flex h-9 shrink-0 items-stretch border-b border-border bg-background">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        <button
          type="button"
          onClick={() => setMainView("overview")}
          className={cn(
            "relative shrink-0 px-3 text-[13px] font-medium transition-colors",
            mainView === "overview"
              ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-primary"
              : "text-muted-foreground hover:text-foreground",
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
                "group relative flex min-w-[120px] max-w-[220px] shrink-0 items-stretch",
                active
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-3 text-left text-[13px]"
                onClick={() => setActiveTab(tab.id)}
              >
                <MethodBadge method={tab.request.method} />
                {pending && <LoaderCircle className="size-3 animate-spin" />}
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
                className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
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
                className="mr-0.5 size-6 shrink-0 opacity-0 group-hover:opacity-100"
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

        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="mx-1 my-auto size-7 shrink-0"
          label="New request tab"
          onClick={newRequestTab}
        >
          <Plus className="size-3.5" />
        </TooltipIconButton>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-2">
        {mainView === "request" && (
          <TooltipIconButton
            variant="ghost"
            size="icon"
            className={cn("size-7", !explorerCollapsed && "bg-accent text-accent-foreground")}
            label={explorerCollapsed ? "Show explorer (⌘B)" : "Hide explorer (⌘B)"}
            onClick={toggleExplorerCollapsed}
          >
            <PanelLeft className="size-3.5" />
          </TooltipIconButton>
        )}
        <EnvironmentSwitcher
          mode="workspace"
          environments={environments}
          workspaceEnvironmentId={activeEnvironmentId}
          workspaceEnvironment={workspaceEnvironment}
          requestEnvironment={activeEnvironment}
          onSetWorkspace={setActiveEnvironmentId}
          onAddEnvironment={addEnvironment}
          onManageEnvironments={() => setMainView("environments")}
          compact
        />
        <WindowMenu />
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className="size-7"
          label="New request"
          onClick={newRequestTab}
        >
          <Plus className="size-3.5" />
        </TooltipIconButton>
      </div>
    </header>
  );
}
