import { Suspense, lazy, useState } from "react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { PacerProvider } from "@tanstack/react-pacer";
import { AppProvider, useApp } from "@/machines";
import { useT } from "@/hooks/useLocale";
import { getScreenshotShotParam } from "@/lib/screenshot-demo";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingScreen } from "./components/LoadingScreen";
import { ThemeSync } from "./components/ThemeSync";
import { CustomThemeSync } from "./components/CustomThemeSync";
import { LocaleSync } from "./components/LocaleSync";
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
  const t = useT();

  if (getScreenshotShotParam() === "boot") {
    return <LoadingScreen label={t("loading.app")} />;
  }

  return (
    <Suspense fallback={<LoadingScreen label={t("loading.app")} />}>
      {user ? <ClientShell /> : <AuthPage />}
    </Suspense>
  );
}

function AppShell() {
  return (
    <PacerProvider defaultOptions={{ debouncer: { wait: 120, trailing: true, leading: false } }}>
      <HotkeysProvider defaultOptions={{ hotkey: { preventDefault: true } }}>
        <HistoryProvider>
          <TooltipProvider delayDuration={300}>
            <ThemeSync />
            <CustomThemeSync />
            <LocaleSync />
            <AppContent />
          </TooltipProvider>
        </HistoryProvider>
      </HotkeysProvider>
    </PacerProvider>
  );
}

function App() {
  const [attempt, setAttempt] = useState(0);

  return (
    <ErrorBoundary onRetry={() => setAttempt((value) => value + 1)}>
      <Toaster />
      <AppProvider key={attempt}>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
