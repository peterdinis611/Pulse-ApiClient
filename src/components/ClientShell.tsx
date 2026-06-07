import { useApp } from "@/machines";
import { ConsolePanel } from "./ConsolePanel";
import { EnvironmentsView } from "./EnvironmentsView";
import { OverviewView } from "./OverviewView";
import { RequestTabBar } from "./RequestTabBar";
import { RequestWorkspace } from "./RequestWorkspace";
import { SettingsView } from "./SettingsView";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

export function ClientShell() {
  const { mainView, consoleOpen } = useApp();

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <RequestTabBar />
          <main className="flex min-h-0 flex-1 flex-col">
            {mainView === "overview" && <OverviewView />}
            {mainView === "environments" && <EnvironmentsView />}
            {mainView === "settings" && <SettingsView />}
            {mainView === "request" && <RequestWorkspace />}
          </main>
          {consoleOpen && <ConsolePanel />}
          <StatusBar />
        </div>
      </div>
    </div>
  );
}
