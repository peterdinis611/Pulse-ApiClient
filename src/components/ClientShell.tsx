import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/machines";
import { AppRail } from "./AppRail";
import { CommandPalette } from "./CommandPalette";
import { GitWorkspaceSync } from "./GitWorkspaceSync";
import { WhatsNewHost } from "./WhatsNewHost";
import { OnboardingHost } from "./OnboardingHost";
import { ExplorerPanel } from "./ExplorerPanel";
import { DeferredFallback } from "./DeferredFallback";
import { LoadingScreen } from "./LoadingScreen";
import { ResizableConsole } from "./ResizableConsole";
import { ResizableExplorer } from "./ResizableExplorer";
import { StatusBar } from "./StatusBar";
import { ViewHeader } from "./ViewHeader";
import { AgentView } from "./AgentView";
import { DocsView } from "./DocsView";
import { EnvironmentsView } from "./EnvironmentsView";
import { McpView } from "./McpView";
import { OverviewView } from "./OverviewView";
import { RequestWorkspace } from "./RequestWorkspace";
import { SettingsView } from "./SettingsView";
import { APP_NAME } from "@/lib/app-config";
import { useAgentSettings } from "@/hooks/useAgentSettings";
import { useWorkspaceHotkeys } from "@/hooks/useWorkspaceHotkeys";
import { useI18n } from "@/hooks/useLocale";
import { getCurrentWindowLabel, setWindowTitle } from "@/lib/window-manager";
import { cn } from "@/lib/utils";
import type { MainView } from "@/types";

/** Console stays lazy — toggled less often than rail views. */
const ConsolePanel = lazy(() =>
  import("./ConsolePanel").then((module) => ({ default: module.ConsolePanel })),
);

const VIEW_ORDER: MainView[] = [
  "overview",
  "request",
  "environments",
  "docs",
  "agent",
  "mcp",
  "settings",
];

function ViewSlot({
  view,
  active,
  children,
}: {
  view: MainView;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-view={view}
      className={cn("min-h-0 flex-1 flex-col overflow-hidden", active ? "flex" : "hidden")}
      hidden={!active}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

export function ClientShell() {
  const { mainView, consoleOpen, tabs, activeTabId, setMainView } = useApp();
  const agentSettings = useAgentSettings();
  const { t, version } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [visited, setVisited] = useState<ReadonlySet<MainView>>(() => new Set([mainView]));

  useWorkspaceHotkeys({ onCommandPalette: () => setPaletteOpen((open) => !open) });

  useEffect(() => {
    if (mainView === "agent" && !agentSettings.enabled) {
      setMainView("overview");
    }
  }, [agentSettings.enabled, mainView, setMainView]);

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(mainView)) return prev;
      const next = new Set(prev);
      next.add(mainView);
      return next;
    });
  }, [mainView]);

  useEffect(() => {
    void (async () => {
      const label = await getCurrentWindowLabel();
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      const title =
        mainView === "request" && activeTab
          ? `${activeTab.request.name.trim() || activeTab.request.method} · ${APP_NAME}`
          : mainView === "overview"
            ? `${t("window.overview")} · ${APP_NAME}`
            : mainView === "settings"
              ? `${t("window.settings")} · ${APP_NAME}`
              : mainView === "environments"
                ? `${t("window.environments")} · ${APP_NAME}`
                : mainView === "docs"
                  ? `${t("window.docs")} · ${APP_NAME}`
                  : mainView === "mcp"
                    ? `${t("window.mcp")} · ${APP_NAME}`
                    : mainView === "agent"
                      ? `${t("window.agent")} · ${APP_NAME}`
                      : APP_NAME;

      try {
        await setWindowTitle(label, title);
      } catch {
        // ignore when not running inside Tauri
      }
    })();
  }, [tabs, activeTabId, mainView, t, version]);

  const showExplorer = mainView === "request";
  const showAgent = agentSettings.enabled;
  const visibleViews = VIEW_ORDER.filter(
    (view) => visited.has(view) && (view !== "agent" || showAgent),
  );

  return (
    <div className="app-shell flex h-screen">
      <AppRail />
      {showExplorer && (
        <ResizableExplorer>
          <ExplorerPanel />
        </ResizableExplorer>
      )}
      <div className="flex min-w-0 flex-1 flex-col bg-surface-0">
        <ViewHeader />
        <main className="workspace-content flex min-h-0 flex-1 flex-col overflow-hidden">
          {visibleViews.includes("overview") && (
            <ViewSlot view="overview" active={mainView === "overview"}>
              <OverviewView />
            </ViewSlot>
          )}
          {visibleViews.includes("request") && (
            <ViewSlot view="request" active={mainView === "request"}>
              <RequestWorkspace />
            </ViewSlot>
          )}
          {visibleViews.includes("environments") && (
            <ViewSlot view="environments" active={mainView === "environments"}>
              <EnvironmentsView />
            </ViewSlot>
          )}
          {visibleViews.includes("docs") && (
            <ViewSlot view="docs" active={mainView === "docs"}>
              <DocsView />
            </ViewSlot>
          )}
          {visibleViews.includes("agent") && (
            <ViewSlot view="agent" active={mainView === "agent"}>
              <AgentView />
            </ViewSlot>
          )}
          {visibleViews.includes("mcp") && (
            <ViewSlot view="mcp" active={mainView === "mcp"}>
              <McpView />
            </ViewSlot>
          )}
          {visibleViews.includes("settings") && (
            <ViewSlot view="settings" active={mainView === "settings"}>
              <SettingsView />
            </ViewSlot>
          )}
        </main>
        {consoleOpen && (
          <Suspense
            fallback={
              <DeferredFallback>
                <LoadingScreen variant="inline" label={t("loading.console")} />
              </DeferredFallback>
            }
          >
            <ResizableConsole>
              <ConsolePanel />
            </ResizableConsole>
          </Suspense>
        )}
        <StatusBar />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <GitWorkspaceSync />
      <OnboardingHost />
      <WhatsNewHost />
    </div>
  );
}
