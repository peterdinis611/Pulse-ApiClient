import { CheckCircle2, ChevronDown, ChevronRight, XCircle, X } from "lucide-react";
import type { CollectionRunResult } from "@/lib/collection-runner";
import { MethodBadge } from "@/components/MethodBadge";
import { TestResultsList } from "@/components/TestResultsList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { cn } from "@/lib/utils";
import { useState } from "react";

type CollectionRunResultsPanelProps = {
  result: CollectionRunResult;
  onClose: () => void;
};

export function CollectionRunResultsPanel({ result, onClose }: CollectionRunResultsPanelProps) {
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({});

  const toggleStep = (index: number) => {
    setOpenSteps((current) => ({ ...current, [index]: !current[index] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Collection runner</h2>
            <p className="text-sm text-muted-foreground">{result.collectionName}</p>
          </div>
          <div className="flex items-center gap-2">
            {result.totalTests > 0 ? (
              <Badge
                className={cn(
                  "font-mono",
                  result.failed > 0
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                )}
              >
                {result.passed}/{result.totalTests} passed
              </Badge>
            ) : (
              <Badge variant="outline">{result.steps.length} requests</Badge>
            )}
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <ScrollAreaWithTop className="min-h-0 flex-1">
          <div className="space-y-2 p-4">
            {result.steps.map((step, index) => {
              const open = openSteps[index] ?? step.testResults?.failed !== 0;
              const failed = step.error || (step.testResults?.failed ?? 0) > 0;
              const passed = !failed;

              return (
                <div key={`${step.saved.id}-${index}`} className="rounded-lg border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                    onClick={() => toggleStep(index)}
                  >
                    {open ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    {passed ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-destructive" />
                    )}
                    <MethodBadge method={step.saved.request.method} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{step.saved.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {step.saved.request.url}
                      </p>
                    </div>
                    {step.response && (
                      <Badge variant="outline" className="font-mono">
                        {step.response.status}
                      </Badge>
                    )}
                    {step.testResults && step.testResults.total > 0 && (
                      <Badge variant="secondary" className="font-mono">
                        {step.testResults.passed}/{step.testResults.total}
                      </Badge>
                    )}
                  </button>

                  {open && (
                    <div className="space-y-3 border-t border-border px-4 py-3">
                      {step.error && (
                        <p className="text-sm text-destructive">{step.error}</p>
                      )}
                      {step.testResults && step.testResults.total > 0 ? (
                        <TestResultsList results={step.testResults} compact />
                      ) : (
                        !step.error && (
                          <p className="text-sm text-muted-foreground">
                            No tests defined for this request.
                          </p>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollAreaWithTop>
      </div>
    </div>
  );
}
