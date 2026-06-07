import { AppProvider, useApp } from "@/machines";
import { ThemeSync } from "./components/ThemeSync";
import { ConsolePanel } from "./components/ConsolePanel";
import { EnvironmentsView } from "./components/EnvironmentsView";
import { OverviewView } from "./components/OverviewView";
import { RequestTabBar } from "./components/RequestTabBar";
import { RequestWorkspace } from "./components/RequestWorkspace";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";

function AppContent() {
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

function App() {
  return (
    <AppProvider>
      <ThemeSync />
      <AppContent />
    </AppProvider>
  );
}

export default App;
