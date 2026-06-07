import { Suspense, lazy, useEffect } from "react";
import { useApp } from "@/machines";
import { LoadingScreen } from "./LoadingScreen";
import { RequestTabBar } from "./RequestTabBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

const ConsolePanel = lazy(() =>
  import("./ConsolePanel").then((module) => ({ default: module.ConsolePanel })),
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
import { APP_NAME } from "@/lib/app-config";
import {
  createAppWindow,
  getCurrentWindowLabel,
  openOverviewWindow,
  setWindowTitle,
} from "@/lib/window-manager";

export function ClientShell() {
  const { mainView, consoleOpen, tabs, activeTabId } = useApp();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        void createAppWindow();
        return;
      }

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openOverviewWindow();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
                : APP_NAME;

      try {
        await setWindowTitle(label, title);
      } catch {
        // ignore when not running inside Tauri
      }
    })();
  }, [tabs, activeTabId, mainView]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <RequestTabBar />
          <main className="flex min-h-0 flex-1 flex-col">
            <Suspense fallback={<LoadingScreen variant="inline" label="Loading view" />}>
              {mainView === "overview" && <OverviewView />}
              {mainView === "environments" && <EnvironmentsView />}
              {mainView === "settings" && <SettingsView />}
              {mainView === "request" && <RequestWorkspace />}
            </Suspense>
          </main>
          {consoleOpen && (
            <Suspense fallback={<LoadingScreen variant="inline" label="Loading console" />}>
              <ConsolePanel />
            </Suspense>
          )}
          <StatusBar />
        </div>
      </div>
    </div>
  );
}
