import { Suspense, lazy, useEffect, useState } from "react";
import { useApp } from "@/machines";
import { AppRail } from "./AppRail";
import { CommandPalette } from "./CommandPalette";
import { GitWorkspaceSync } from "./GitWorkspaceSync";
import { WhatsNewHost } from "./WhatsNewHost";
import { OnboardingHost } from "./OnboardingHost";
import { ExplorerPanel } from "./ExplorerPanel";
import { LoadingScreen } from "./LoadingScreen";
import { ResizableConsole } from "./ResizableConsole";
import { ResizableExplorer } from "./ResizableExplorer";
import { StatusBar } from "./StatusBar";
import { ViewHeader } from "./ViewHeader";
import { APP_NAME } from "@/lib/app-config";
import { useWorkspaceHotkeys } from "@/hooks/useWorkspaceHotkeys";
import { useI18n } from "@/hooks/useLocale";
import { getCurrentWindowLabel, setWindowTitle } from "@/lib/window-manager";

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
  const { mainView, consoleOpen, tabs, activeTabId } = useApp();
  const { t, version } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useWorkspaceHotkeys({ onCommandPalette: () => setPaletteOpen((open) => !open) });

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
                  : APP_NAME;

      try {
        await setWindowTitle(label, title);
      } catch {
        // ignore when not running inside Tauri
      }
    })();
  }, [tabs, activeTabId, mainView, t, version]);

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
          <Suspense fallback={<LoadingScreen variant="inline" label={t("loading.view")} />}>
            {mainView === "overview" && <OverviewView />}
            {mainView === "environments" && <EnvironmentsView />}
            {mainView === "settings" && <SettingsView />}
            {mainView === "docs" && <DocsView />}
            {mainView === "request" && <RequestWorkspace />}
          </Suspense>
        </main>
        {consoleOpen && (
          <Suspense fallback={<LoadingScreen variant="inline" label={t("loading.console")} />}>
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
