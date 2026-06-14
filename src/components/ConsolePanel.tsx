import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useApp } from "@/machines";
import { runConsoleInput } from "@/lib/console-eval";
import { useConsoleLog, type ConsoleEntryKind } from "@/hooks/useConsoleLog";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function entryClassName(kind: ConsoleEntryKind): string {
  switch (kind) {
    case "success":
      return "text-console-success";
    case "error":
      return "text-console-error";
    case "input":
      return "text-console-foreground";
    case "info":
      return "text-console-muted";
    default:
      return "text-console-foreground whitespace-pre-wrap";
  }
}

export function ConsolePanel() {
  const { activeTabId, error, response, loading, testResults } = useApp();
  const { entries, clearConsole, logInput, logOutput } = useConsoleLog({
    tabId: activeTabId,
    loading,
    error,
    response,
    testResults,
  });
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  const handleSubmit = async () => {
    const value = draft.trim();
    if (!value || running) return;

    if (value.toLowerCase() === "clear") {
      clearConsole();
      setDraft("");
      return;
    }

    logInput(value);
    setDraft("");

    if (!response) {
      logOutput("Send a request first, then try pulse.response or pulse.test assertions.", "error");
      return;
    }

    setRunning(true);
    try {
      const result = await runConsoleInput(value, response);
      const kind: ConsoleEntryKind =
        result.level === "error"
          ? "error"
          : result.level === "success"
            ? "success"
            : "output";
      logOutput(result.output, kind);
    } catch (err) {
      logOutput(err instanceof Error ? err.message : "Failed to run input", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-52 flex-col border-t border-border bg-console">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <p className="font-mono text-xs text-console-muted">Console</p>
        <TooltipIconButton
          size="icon"
          variant="ghost"
          className="size-7 text-console-muted hover:text-console-foreground"
          label="Clear console"
          onClick={clearConsole}
          disabled={entries.length === 0}
        >
          <Trash2 className="size-3.5" />
        </TooltipIconButton>
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" showTopButton={entries.length > 8}>
        <div className="space-y-1 px-4 py-2 font-mono text-xs">
          {entries.length === 0 ? (
            <p className="text-console-muted">
              Request logs and test results appear here. Type help for commands.
            </p>
          ) : (
            entries.map((entry) => (
              <p key={entry.id} className={cn("leading-relaxed", entryClassName(entry.kind))}>
                {entry.text}
              </p>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollAreaWithTop>

      <form
        className="flex items-center gap-2 border-t border-border/60 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <span className="shrink-0 font-mono text-xs text-console-muted">{">"}</span>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          placeholder="help · json() · pulse.expect(pulse.response.code).to.eql(200)"
          className="h-8 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
          disabled={running}
        />
        {running && <LoaderCircle className="size-3.5 shrink-0 animate-spin text-console-muted" />}
      </form>
    </div>
  );
}
