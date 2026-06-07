import { AppProvider, useApp } from "@/machines";
import { AuthPage } from "./components/AuthPage";
import { ClientShell } from "./components/ClientShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeSync } from "./components/ThemeSync";
import { Toaster } from "./components/ui/sonner";

function AppContent() {
  const { user } = useApp();

  if (!user) {
    return <AuthPage />;
  }

  return <ClientShell />;
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
