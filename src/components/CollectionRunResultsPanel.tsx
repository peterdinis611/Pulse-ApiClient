import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCopy,
  X,
  XCircle,
} from "lucide-react";
import type { CollectionRunResult, CollectionRunStep } from "@/lib/collection-runner";
import { MethodBadge } from "@/components/MethodBadge";
import { TestResultsList } from "@/components/TestResultsList";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { statusBadgeClass } from "@/lib/method-colors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type CollectionRunResultsPanelProps = {
  result: CollectionRunResult;
  onClose: () => void;
};

/** Long URLs/errors must wrap inside narrow flex children. */
const wrapLong = "min-w-0 overflow-hidden break-all [overflow-wrap:anywhere]";

function summarizeError(error: string): { headline: string; detail: string | null } {
  const trimmed = error.trim();
  const urlMatch = trimmed.match(/https?:\/\/\S+/);
  if (urlMatch) {
    const withoutUrl = trimmed
      .replace(urlMatch[0], "")
      .replace(/\(\s*\)/g, "")
      .replace(/\(\s*$/g, "")
      .trim();
    const headline =
      withoutUrl
        .replace(/^Request failed:\s*/i, "")
        .replace(/error sending request for url/i, "Could not reach the server")
        .replace(/[:\s(]+$/g, "")
        .trim() || "Request failed";
    return { headline, detail: urlMatch[0].replace(/[)\].,;]+$/, "") };
  }
  return { headline: trimmed, detail: null };
}

function stepFailed(step: CollectionRunStep): boolean {
  return Boolean(step.error) || (step.testResults?.failed ?? 0) > 0;
}

export function CollectionRunResultsPanel({ result, onClose }: CollectionRunResultsPanelProps) {
  const failedCount = useMemo(
    () => result.steps.filter(stepFailed).length,
    [result.steps],
  );
  const passedCount = result.steps.length - failedCount;
  const allPassed = failedCount === 0;

  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    result.steps.forEach((step, index) => {
      if (stepFailed(step)) initial[index] = true;
    });
    return initial;
  });

  const copyError = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", "Error details copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-card text-card-foreground"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-runner-title"
      >
        <header className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Collection run
              </p>
              <h2
                id="collection-runner-title"
                className="truncate text-lg font-semibold"
              >
                {result.collectionName}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
              <TooltipIconButton
                variant="ghost"
                size="icon"
                className="size-8"
                label="Close"
                onClick={onClose}
              >
                <X className="size-4" />
              </TooltipIconButton>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <StatPill label="Passed" value={passedCount} tone="success" />
            <StatPill label="Failed" value={failedCount} tone="danger" />
            <StatPill label="Requests" value={result.steps.length} tone="neutral" />
            {result.totalTests > 0 && (
              <StatPill
                label="Tests"
                value={`${result.passed}/${result.totalTests}`}
                tone={result.failed > 0 ? "danger" : "success"}
              />
            )}
          </div>

          <div
            className={cn(
              "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]",
              allPassed ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {allPassed ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <CircleAlert className="size-4 shrink-0" />
            )}
            <span className="min-w-0 font-medium">
              {allPassed
                ? "All requests completed successfully"
                : `${failedCount} of ${result.steps.length} request${result.steps.length === 1 ? "" : "s"} failed`}
            </span>
          </div>
        </header>

        <ScrollAreaWithTop className="min-h-0 min-w-0 flex-1" resetKey={result.collectionId}>
          <div className="w-full min-w-0 space-y-2 p-5">
            {result.steps.map((step, index) => {
              const open = openSteps[index] ?? false;
              const failed = stepFailed(step);
              const errorParts = step.error ? summarizeError(step.error) : null;

              return (
                <div
                  key={`${step.saved.id}-${index}`}
                  className={cn(
                    "min-w-0 overflow-hidden rounded-xl border",
                    failed
                      ? "border-destructive/30 bg-destructive/[0.03]"
                      : "border-border bg-background/50",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 overflow-hidden px-3 py-3 text-left hover:bg-muted/40"
                    onClick={() =>
                      setOpenSteps((current) => ({ ...current, [index]: !current[index] }))
                    }
                  >
                    {open ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    {failed ? (
                      <XCircle className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    )}
                    <MethodBadge method={step.saved.request.method} />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate text-[13px] font-medium">{step.saved.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {step.saved.request.url}
                      </p>
                    </div>
                    {step.response && (
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                          statusBadgeClass(step.response.status),
                        )}
                      >
                        {step.response.status}
                      </span>
                    )}
                  </button>

                  {open && (
                    <div className="min-w-0 space-y-3 overflow-hidden border-t border-border/70 px-3 py-3">
                      <div className="min-w-0 overflow-hidden rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          URL
                        </p>
                        <p className={cn("mt-1 font-mono text-[12px] leading-relaxed text-foreground/90", wrapLong)}>
                          {step.saved.request.url}
                        </p>
                      </div>

                      {errorParts && (
                        <div className="min-w-0 space-y-2 overflow-hidden rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn("text-[13px] font-medium text-destructive", wrapLong)}>
                              {errorParts.headline}
                            </p>
                            {step.error && (
                              <TooltipIconButton
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0 text-destructive/70"
                                label="Copy error"
                                onClick={() => void copyError(step.error!)}
                              >
                                <ClipboardCopy className="size-3.5" />
                              </TooltipIconButton>
                            )}
                          </div>
                          {errorParts.detail && (
                            <p
                              className={cn(
                                "font-mono text-[11px] leading-relaxed text-destructive/80",
                                wrapLong,
                              )}
                            >
                              {errorParts.detail}
                            </p>
                          )}
                          {step.error && (
                            <pre
                              className={cn(
                                "max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-background/70 p-2.5 font-mono text-[11px] leading-relaxed text-destructive/75",
                                wrapLong,
                              )}
                            >
                              {step.error}
                            </pre>
                          )}
                        </div>
                      )}

                      {step.response && (
                        <div className="flex flex-wrap gap-2 text-[12px] text-muted-foreground">
                          <span className="rounded-md bg-muted px-2 py-1 font-mono">
                            {step.response.status} {step.response.statusText}
                          </span>
                          <span className="rounded-md bg-muted px-2 py-1 tabular-nums">
                            {step.response.elapsedMs} ms
                          </span>
                          <span className="rounded-md bg-muted px-2 py-1 tabular-nums">
                            {(step.response.sizeBytes / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      )}

                      {step.testResults && step.testResults.total > 0 ? (
                        <TestResultsList results={step.testResults} compact />
                      ) : (
                        !step.error && (
                          <p className="text-[12px] text-muted-foreground">
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

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[12px] text-muted-foreground">
            {result.steps.length} request{result.steps.length === 1 ? "" : "s"}
            {result.totalTests > 0 ? ` · ${result.totalTests} tests` : ""}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "success" | "danger" | "neutral";
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
