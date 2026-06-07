import { useApp } from "@/machines";

export function ConsolePanel() {
  const { error, response, loading } = useApp();

  return (
    <div className="h-40 border-t border-border bg-console px-4 py-3 font-mono text-xs text-console-foreground">
      <p className="mb-2 text-console-muted">Console</p>
      {loading && <p>→ Sending request…</p>}
      {error && <p className="text-console-error">✕ {error}</p>}
      {response && !loading && (
        <p className="text-console-success">
          ✓ {response.status} {response.statusText} · {response.elapsedMs} ms
          {response.fromCache ? " (cached)" : ""}
        </p>
      )}
      {!loading && !error && !response && (
        <p className="text-console-muted">Request logs will appear here.</p>
      )}
    </div>
  );
}
