import { useEffect, useRef, useState } from "react";
import { AppMachineContext } from "@/machines/AppProvider";
import {
  getGitWorkspaceRoot,
  getGitWorkspaceStatus,
  listGitAgentHistory,
  listGitPending,
  listenGitWorkspaceChanges,
  loadGitWorkspace,
  mapGitWorkspace,
} from "@/lib/git-workspace";
import {
  clearGitWorkspaceUiStatus,
  patchGitWorkspaceUiStatus,
} from "@/lib/git-workspace-status";
import { importHistoryEntries } from "@/lib/history-client";
import { prettyMaybeJson, unifiedLineDiff } from "@/lib/line-diff";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { HistoryEntry } from "@/types";
import { normalizeRequest } from "@/lib/helpers";

const RELOAD_DEBOUNCE_MS = 450;

export function GitWorkspaceSync() {
  const actorRef = AppMachineContext.useActorRef();
  const [conflict, setConflict] = useState<{ disk: string; editor: string; filePath: string } | null>(
    null,
  );
  const [pending, setPending] = useState<string[]>([]);
  const lastDisk = useRef(new Map<string, string>());
  const lastBranch = useRef<string | null>(null);
  const reloadTimer = useRef(0);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    const refreshStatus = async (root: string) => {
      try {
        const status = await getGitWorkspaceStatus(root);
        if (!mounted) return;
        const branchChanged =
          lastBranch.current != null && lastBranch.current !== status.branch;
        lastBranch.current = status.branch;
        patchGitWorkspaceUiStatus({
          root,
          branch: status.branch,
          dirty: status.dirty,
          ahead: status.ahead,
          behind: status.behind,
          conflictedPaths: status.conflicted,
          files: status.files ?? [],
        });
        return branchChanged;
      } catch {
        if (mounted) {
          patchGitWorkspaceUiStatus({
            root,
            branch: null,
            dirty: false,
            ahead: 0,
            behind: 0,
            conflictedPaths: [],
            files: [],
          });
        }
        return false;
      }
    };

    const reload = async (force = false) => {
      const root = getGitWorkspaceRoot();
      if (!root || !mounted) return;
      patchGitWorkspaceUiStatus({ syncing: true, root });
      try {
        const branchChanged = await refreshStatus(root);
        const ctx = actorRef.getSnapshot().context;
        const { collections, tabs } = {
          collections: ctx.persisted.collections,
          tabs: ctx.tabs,
        };
        const payload = await loadGitWorkspace(root);
        const mapped = mapGitWorkspace(payload);
        const active = tabs.find((tab) => tab.savedRequestId);
        const saved = collections.find((item) => item.id === active?.savedRequestId);
        const diskRequest = mapped.collections.find((item) => item.id === saved?.id)?.request;
        if (!force && !branchChanged && active && saved && diskRequest) {
          const disk = JSON.stringify(diskRequest);
          const editor = JSON.stringify(active.request);
          const previous = lastDisk.current.get(saved.id);
          if (previous && disk !== previous && editor !== previous) {
            const [prettyDisk, prettyEditor] = await Promise.all([
              prettyMaybeJson(disk),
              prettyMaybeJson(editor),
            ]);
            const nextConflict = {
              disk: prettyDisk,
              editor: prettyEditor,
              filePath: saved.filePath ?? saved.name,
            };
            setConflict(nextConflict);
            patchGitWorkspaceUiStatus({ conflict: nextConflict, syncing: false });
            return;
          }
          lastDisk.current.set(saved.id, disk);
        }
        if (branchChanged) {
          lastDisk.current.clear();
          toast.info("Branch changed", `Reloaded collections for ${lastBranch.current ?? "HEAD"}`);
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
        if (mounted) {
          setPending(nextPending);
          setConflict(null);
          patchGitWorkspaceUiStatus({
            pendingCount: nextPending.length,
            conflict: null,
          });
        }
        actorRef.send({ type: "LOAD_GIT_WORKSPACE", ...mapped });
      } catch (error) {
        console.warn("Git workspace reload failed:", error);
      } finally {
        if (mounted) patchGitWorkspaceUiStatus({ syncing: false });
      }
    };

    const root = getGitWorkspaceRoot();
    if (root) {
      void reload(true);
    } else {
      clearGitWorkspaceUiStatus();
    }

    void listenGitWorkspaceChanges(async () => {
      if (!mounted) return;
      window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => {
        void reload();
      }, RELOAD_DEBOUNCE_MS);
    }).then((fn) => {
      if (!mounted) fn();
      else unlisten = fn;
    });

    return () => {
      mounted = false;
      window.clearTimeout(reloadTimer.current);
      unlisten?.();
    };
  }, [actorRef]);

  const [diffRows, setDiffRows] = useState<Array<{ kind: "same" | "add" | "del"; text: string }>>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!conflict) {
      setDiffRows([]);
      return;
    }
    void unifiedLineDiff(conflict.disk, conflict.editor)
      .then((rows) => {
        if (!cancelled) setDiffRows(rows.filter((row) => row.kind !== "same"));
      })
      .catch(() => {
        if (!cancelled) setDiffRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [conflict]);

  if (!conflict && pending.length === 0) return null;

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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setConflict(null);
                patchGitWorkspaceUiStatus({ conflict: null });
              }}
            >
              Keep editor
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConflict(null);
                patchGitWorkspaceUiStatus({ conflict: null });
                const root = getGitWorkspaceRoot();
                if (!root) return;
                void loadGitWorkspace(root)
                  .then((payload) => {
                    actorRef.send({ type: "LOAD_GIT_WORKSPACE", ...mapGitWorkspace(payload) });
                    toast.success("Reloaded from disk");
                  })
                  .catch(() => toast.error("Reload failed"));
              }}
            >
              Reload from disk
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
