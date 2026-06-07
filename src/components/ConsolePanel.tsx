import { useApp } from "@/machines";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";

export function ConsolePanel() {
  const { error, response, loading, testResults } = useApp();

  return (
    <div className="flex h-40 flex-col border-t border-border bg-console">
      <div className="border-b border-border/60 px-4 py-2">
        <p className="font-mono text-xs text-console-muted">Console</p>
      </div>
      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={`${loading}-${response?.elapsedMs ?? 0}`}>
        <div className="space-y-1 px-4 py-2 font-mono text-xs text-console-foreground">
          {loading && <p>→ Sending request…</p>}
          {error && <p className="text-console-error">✕ {error}</p>}
          {response && !loading && (
            <p className="text-console-success">
              ✓ {response.status} {response.statusText} · {response.elapsedMs} ms
              {response.fromCache ? " (cached)" : ""}
            </p>
          )}
          {testResults && testResults.total > 0 && !loading && (
            <p className={testResults.failed > 0 ? "text-console-error" : "text-console-success"}>
              {testResults.failed > 0 ? "✕" : "✓"} Tests {testResults.passed}/{testResults.total} passed
            </p>
          )}
          {!loading && !error && !response && (
            <p className="text-console-muted">Request logs and test results will appear here.</p>
          )}
        </div>
      </ScrollAreaWithTop>
    </div>
  );
}
