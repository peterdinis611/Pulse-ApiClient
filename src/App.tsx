import { Suspense, lazy, useState } from "react";
import { AppProvider, useApp } from "@/machines";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingScreen } from "./components/LoadingScreen";
import { ThemeSync } from "./components/ThemeSync";
import { CustomThemeSync } from "./components/CustomThemeSync";
import { HistoryProvider } from "./hooks/useHistory";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

const AuthPage = lazy(() =>
  import("./components/AuthPage").then((module) => ({ default: module.AuthPage })),
);
const ClientShell = lazy(() =>
  import("./components/ClientShell").then((module) => ({ default: module.ClientShell })),
);

function AppContent() {
  const { user } = useApp();

  return (
    <Suspense fallback={<LoadingScreen label="Loading app" />}>
      {user ? <ClientShell /> : <AuthPage />}
    </Suspense>
  );
}

function AppShell() {
  return (
    <HistoryProvider>
      <TooltipProvider delayDuration={300}>
        <ThemeSync />
        <CustomThemeSync />
        <AppContent />
      </TooltipProvider>
    </HistoryProvider>
  );
}

function App() {
  const [attempt, setAttempt] = useState(0);

  return (
    <ErrorBoundary onRetry={() => setAttempt((value) => value + 1)}>
      <Toaster position="top-right" />
      <AppProvider key={attempt}>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
