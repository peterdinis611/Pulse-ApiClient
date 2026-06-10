import { Suspense, lazy, useEffect } from "react";
import { useApp } from "@/machines";
import { LayoutControls } from "./LayoutControls";
import { LoadingScreen } from "./LoadingScreen";
import { RequestTabBar } from "./RequestTabBar";
import { ResizableSidebar } from "./ResizableSidebar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
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
  const { mainView, consoleOpen, tabs, activeTabId, sidebarPosition, toggleSidebarCollapsed } =
    useApp();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === "b" && !event.shiftKey) {
          event.preventDefault();
          toggleSidebarCollapsed();
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
  }, [toggleSidebarCollapsed]);

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

  const sidebar = (
    <ResizableSidebar position={sidebarPosition}>
      <Sidebar />
    </ResizableSidebar>
  );

  const workspace = (
    <div className="workspace-surface flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 bg-card/50 px-2 backdrop-blur-md">
        <RequestTabBar />
        <div className="hidden shrink-0 pr-2 lg:flex">
          <LayoutControls />
        </div>
      </div>
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
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarPosition === "left" ? (
          <>
            {sidebar}
            {workspace}
          </>
        ) : (
          <>
            {workspace}
            {sidebar}
          </>
        )}
      </div>
    </div>
  );
}
