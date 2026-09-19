import { useEffect, useRef, useState } from "react";
import { useApp } from "@/machines";
import {
  getGitWorkspaceRoot,
  listGitAgentHistory,
  listGitPending,
  listenGitWorkspaceChanges,
  loadGitWorkspace,
  mapGitWorkspace,
} from "@/lib/git-workspace";
import { importHistoryEntries } from "@/lib/history-client";
import { prettyMaybeJson, unifiedLineDiff } from "@/lib/line-diff";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { HistoryEntry } from "@/types";
import { normalizeRequest } from "@/lib/helpers";

export function GitWorkspaceSync() {
  const { collections, tabs, loadGitWorkspaceState } = useApp();
  const [conflict, setConflict] = useState<{ disk: string; editor: string; filePath: string } | null>(
    null,
  );
  const [pending, setPending] = useState<string[]>([]);
  const lastDisk = useRef(new Map<string, string>());

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    void listenGitWorkspaceChanges(async () => {
      const root = getGitWorkspaceRoot();
      if (!root || !mounted) return;
      try {
        const payload = await loadGitWorkspace(root);
        const mapped = mapGitWorkspace(payload);
        const active = tabs.find((tab) => tab.savedRequestId);
        const saved = collections.find((item) => item.id === active?.savedRequestId);
        const diskRequest = mapped.collections.find((item) => item.id === saved?.id)?.request;
        if (active && saved && diskRequest) {
          const disk = JSON.stringify(diskRequest);
          const editor = JSON.stringify(active.request);
          const previous = lastDisk.current.get(saved.id);
          if (previous && disk !== previous && editor !== previous) {
            setConflict({
              disk: prettyMaybeJson(disk),
              editor: prettyMaybeJson(editor),
              filePath: saved.filePath ?? saved.name,
            });
            return;
          }
          lastDisk.current.set(saved.id, disk);
        }
        const history = await listGitAgentHistory(root).catch(() => []);
        const mappedHistory: HistoryEntry[] = [];
        for (const item of history) {
          if (!item || typeof item !== "object") continue;
          const entry = item as Partial<HistoryEntry> & { request?: unknown };
          if (!entry.request || typeof entry.request !== "object") continue;
          mappedHistory.push({
            id: String(entry.id ?? `hist_agent_${Date.now()}`),
            sentAt: String(entry.sentAt ?? new Date().toISOString()),
            request: normalizeRequest(entry.request as HistoryEntry["request"]),
            response: entry.response,
            source: "agent",
          });
        }
        if (mappedHistory.length) {
          await importHistoryEntries(mappedHistory).catch(() => 0);
        }
        const nextPending = await listGitPending(root).catch(() => []);
        if (mounted) setPending(nextPending);
        loadGitWorkspaceState(mapped);
      } catch (error) {
        console.warn("Git workspace reload failed:", error);
      }
    }).then((fn) => {
      if (!mounted) fn();
      else unlisten = fn;
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [collections, loadGitWorkspaceState, tabs]);

  if (!conflict && pending.length === 0) return null;

  const diffRows = conflict ? unifiedLineDiff(conflict.disk, conflict.editor).filter((row) => row.kind !== "same") : [];

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50 w-[min(420px,calc(100vw-2rem))] space-y-3">
      {pending.length > 0 && (
        <div className="border border-border bg-background/95 p-4 shadow-xl">
          <p className="text-sm font-medium">Agent wants to mutate</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pending.length} pending file(s) in <span className="font-mono">.pulse/pending</span>. Re-run the MCP tool with
            confirm=true after you review it.
          </p>
        </div>
      )}
      {conflict && (
        <div className="border border-border bg-background/95 p-4 shadow-xl">
          <p className="text-sm font-medium">Disk changed this request</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{conflict.filePath}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Keep your editor, or reload YAML from Git. Pulse will not overwrite silently.
          </p>
          {diffRows.length > 0 && (
            <pre className="mt-2 max-h-32 overflow-auto font-mono text-[10px] leading-4">
              {diffRows.slice(0, 40).map((row, index) => (
                <div key={`${row.kind}-${index}`} className={row.kind === "add" ? "text-emerald-600" : "text-red-600"}>
                  {row.kind === "add" ? "+" : "-"} {row.text}
                </div>
              ))}
            </pre>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConflict(null)}>
              Keep editor
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const root = getGitWorkspaceRoot();
                if (!root) return;
                void loadGitWorkspace(root).then((payload) => {
                  loadGitWorkspaceState(mapGitWorkspace(payload));
                  setConflict(null);
                  toast.success("Reloaded from disk");
                });
              }}
            >
              Load disk
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
