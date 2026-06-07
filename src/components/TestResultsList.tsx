import { CheckCircle2, XCircle } from "lucide-react";
import type { TestRunResult } from "@/types";
import { cn } from "@/lib/utils";

export function TestResultsList({
  results,
  compact = false,
}: {
  results: TestRunResult;
  compact?: boolean;
}) {
  if (results.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tests defined. Add Postman-style tests or JSON assertions in the Tests tab.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {results.passed} passed
        </span>
        {results.failed > 0 && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <XCircle className="size-4" />
            {results.failed} failed
          </span>
        )}
        <span className="text-muted-foreground">{results.total} total</span>
      </div>

      <div className="space-y-2">
        {results.results.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className={cn(
              "rounded-md border px-3 py-2",
              item.passed
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-destructive/30 bg-destructive/10",
            )}
          >
            <div className="flex items-start gap-2">
              {item.passed ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.name}</p>
                {item.message && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.message}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
