import { Suspense, lazy } from "react";
import { AppProvider, useApp } from "@/machines";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingScreen } from "./components/LoadingScreen";
import { ThemeSync } from "./components/ThemeSync";
import { Toaster } from "./components/ui/sonner";

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

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ThemeSync />
        <Toaster position="top-right" />
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
