import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { shallowEqualAppSlice, useAppSelector, useAppSend } from "@/machines";
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
import type { MessageKey } from "@/lib/i18n";
import type { MainView } from "@/types";

/** Console stays lazy — toggled less often than rail views. */
const ConsolePanel = lazy(() =>
  import("./ConsolePanel").then((module) => ({ default: module.ConsolePanel })),
);

/** Request stays mounted after first visit; other views unmount when hidden. */
const KEEP_ALIVE_VIEWS = new Set<MainView>(["request"]);

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

function viewTitleKey(view: MainView): MessageKey | null {
  switch (view) {
    case "overview":
      return "window.overview";
    case "settings":
      return "window.settings";
    case "environments":
      return "window.environments";
    case "docs":
      return "window.docs";
    case "mcp":
      return "window.mcp";
    case "agent":
      return "window.agent";
    default:
      return null;
  }
}

export function ClientShell() {
  const { mainView, consoleOpen, activeTabId, activeTabTitle } = useAppSelector(
    (state) => {
      const tab = state.context.tabs.find((item) => item.id === state.context.activeTabId);
      const name = tab?.request.name.trim() || tab?.request.method || "";
      return {
        mainView: state.context.mainView,
        consoleOpen: state.context.consoleOpen,
        activeTabId: state.context.activeTabId,
        activeTabTitle: name,
      };
    },
    shallowEqualAppSlice,
  );
  const send = useAppSend();
  const agentSettings = useAgentSettings();
  const { t, version } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [requestVisited, setRequestVisited] = useState(() => mainView === "request");

  useWorkspaceHotkeys({ onCommandPalette: () => setPaletteOpen((open) => !open) });

  useEffect(() => {
    if (mainView === "agent" && !agentSettings.enabled) {
      send({ type: "SET_MAIN_VIEW", view: "overview" });
    }
  }, [agentSettings.enabled, mainView, send]);

  useEffect(() => {
    if (mainView === "request") setRequestVisited(true);
  }, [mainView]);

  useEffect(() => {
    void (async () => {
      const label = await getCurrentWindowLabel();
      const titleKey = viewTitleKey(mainView);
      const title =
        mainView === "request" && activeTabTitle
          ? `${activeTabTitle} · ${APP_NAME}`
          : titleKey
            ? `${t(titleKey)} · ${APP_NAME}`
            : APP_NAME;

      try {
        await setWindowTitle(label, title);
      } catch {
        // ignore when not running inside Tauri
      }
    })();
  }, [activeTabId, activeTabTitle, mainView, t, version]);

  const showExplorer = mainView === "request";
  const showAgent = agentSettings.enabled;

  const mountView = (view: MainView) => {
    if (view === "agent" && !showAgent) return false;
    if (mainView === view) return true;
    return KEEP_ALIVE_VIEWS.has(view) && requestVisited;
  };

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
          {mountView("overview") && (
            <ViewSlot view="overview" active={mainView === "overview"}>
              <OverviewView />
            </ViewSlot>
          )}
          {mountView("request") && (
            <ViewSlot view="request" active={mainView === "request"}>
              <RequestWorkspace />
            </ViewSlot>
          )}
          {mountView("environments") && (
            <ViewSlot view="environments" active={mainView === "environments"}>
              <EnvironmentsView />
            </ViewSlot>
          )}
          {mountView("docs") && (
            <ViewSlot view="docs" active={mainView === "docs"}>
              <DocsView />
            </ViewSlot>
          )}
          {mountView("agent") && (
            <ViewSlot view="agent" active={mainView === "agent"}>
              <AgentView />
            </ViewSlot>
          )}
          {mountView("mcp") && (
            <ViewSlot view="mcp" active={mainView === "mcp"}>
              <McpView />
            </ViewSlot>
          )}
          {mountView("settings") && (
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
