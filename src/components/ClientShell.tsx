import { Suspense, lazy, useEffect } from "react";
import { useApp } from "@/machines";
import { AppRail } from "./AppRail";
import { ExplorerPanel } from "./ExplorerPanel";
import { LoadingScreen } from "./LoadingScreen";
import { ResizableConsole } from "./ResizableConsole";
import { ResizableExplorer } from "./ResizableExplorer";
import { StatusBar } from "./StatusBar";
import { ViewHeader } from "./ViewHeader";
import { APP_NAME } from "@/lib/app-config";
import {
  createAppWindow,
  getCurrentWindowLabel,
  openOverviewWindow,
  setWindowTitle,
} from "@/lib/window-manager";

const ConsolePanel = lazy(() =>
  import("./ConsolePanel").then((module) => ({ default: module.ConsolePanel })),
);
const DocsView = lazy(() =>
  import("./DocsView").then((module) => ({ default: module.DocsView })),
);
const EnvironmentsView = lazy(() =>
  import("./EnvironmentsView").then((module) => ({ default: module.EnvironmentsView })),
);
const OverviewView = lazy(() =>
  import("./OverviewView").then((module) => ({ default: module.OverviewView })),
);
const RequestWorkspace = lazy(() =>
  import("./RequestWorkspace").then((module) => ({ default: module.RequestWorkspace })),
);
const SettingsView = lazy(() =>
  import("./SettingsView").then((module) => ({ default: module.SettingsView })),
);

export function ClientShell() {
  const { mainView, consoleOpen, tabs, activeTabId, toggleExplorerCollapsed } = useApp();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === "b" && !event.shiftKey) {
          event.preventDefault();
          toggleExplorerCollapsed();
          return;
        }

        if (event.shiftKey) {
          if (event.key.toLowerCase() === "n") {
            event.preventDefault();
            void createAppWindow();
            return;
          }

          if (event.key.toLowerCase() === "o") {
            event.preventDefault();
            void openOverviewWindow();
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleExplorerCollapsed]);

  useEffect(() => {
    void (async () => {
      const label = await getCurrentWindowLabel();
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      const title =
        mainView === "request" && activeTab
          ? `${activeTab.request.name.trim() || activeTab.request.method} · ${APP_NAME}`
          : mainView === "overview"
            ? `Overview · ${APP_NAME}`
            : mainView === "settings"
              ? `Settings · ${APP_NAME}`
              : mainView === "environments"
                ? `Environments · ${APP_NAME}`
                : mainView === "docs"
                  ? `Docs · ${APP_NAME}`
                  : APP_NAME;

      try {
        await setWindowTitle(label, title);
      } catch {
        // ignore when not running inside Tauri
      }
    })();
  }, [tabs, activeTabId, mainView]);

  const showExplorer = mainView === "request";

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
          <Suspense fallback={<LoadingScreen variant="inline" label="Loading view" />}>
            {mainView === "overview" && <OverviewView />}
            {mainView === "environments" && <EnvironmentsView />}
            {mainView === "settings" && <SettingsView />}
            {mainView === "docs" && <DocsView />}
            {mainView === "request" && <RequestWorkspace />}
          </Suspense>
        </main>
        {consoleOpen && (
          <Suspense fallback={<LoadingScreen variant="inline" label="Loading console" />}>
            <ResizableConsole>
              <ConsolePanel />
            </ResizableConsole>
          </Suspense>
        )}
        <StatusBar />
      </div>
    </div>
  );
}
