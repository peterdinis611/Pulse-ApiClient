import { useState } from "react";
import { AlertTriangle, Copy, RefreshCw, RotateCcw, Zap } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import { formatErrorDetails, getErrorPresentation, type ErrorPresentation } from "@/lib/error-presentation";
import { applyTheme, cycleThemeMode, getThemeDefinition, loadThemeMode, saveThemeMode, type ThemeMode } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppErrorScreenProps = {
  error: Error;
  presentation?: ErrorPresentation;
  onRetry?: () => void;
};

function StandaloneThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemeMode());

  const cycleTheme = () => {
    const next = cycleThemeMode(theme);
    saveThemeMode(next);
    applyTheme(next);
    setTheme(next);
  };

  return (
    <Button type="button" variant="ghost" size="sm" onClick={cycleTheme}>
      Theme: {getThemeDefinition(theme).label}
    </Button>
  );
}

export function AppErrorScreen({ error, presentation, onRetry }: AppErrorScreenProps) {
  const copy = presentation ?? getErrorPresentation(error);
  const [showDetails, setShowDetails] = useState(false);
  const details = formatErrorDetails(error);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(details);
      toast.success("Error details copied");
    } catch {
      toast.error("Could not copy error details");
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">Recovery mode</p>
          </div>
        </div>
        <StandaloneThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl space-y-6">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-background text-destructive">
                <AlertTriangle className="size-5" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
                {copy.hint && (
                  <p className="text-sm leading-relaxed text-foreground/80">{copy.hint}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {onRetry && (
              <Button type="button" onClick={onRetry}>
                <RotateCcw className="size-4" />
                Try again
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleReload}>
              <RefreshCw className="size-4" />
              Reload app
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleCopy()}>
              <Copy className="size-4" />
              Copy details
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
              onClick={() => setShowDetails((open) => !open)}
              aria-expanded={showDetails}
            >
              Technical details
              <span className="text-xs font-normal text-muted-foreground">
                {showDetails ? "Hide" : "Show"}
              </span>
            </button>
            {showDetails && (
              <pre
                className={cn(
                  "max-h-64 overflow-auto border-t border-border px-4 py-3 font-mono text-xs leading-relaxed",
                  "whitespace-pre-wrap break-words text-muted-foreground",
                )}
              >
                {details}
              </pre>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
