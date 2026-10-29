import { useEffect, useMemo, useState } from "react";
import { GitBranch, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getGitWorkspaceRoot,
  getGitWorkspaceStatus,
  gitWorkspaceAdd,
  gitWorkspaceCommit,
  gitWorkspaceDiffStat,
} from "@/lib/git-workspace";
import {
  GIT_WORKSPACE_STATUS_EVENT,
  getGitWorkspaceUiStatus,
  patchGitWorkspaceUiStatus,
  type GitWorkspaceUiStatus,
} from "@/lib/git-workspace-status";
import { isBetaFeatureEnabled } from "@/lib/release-channel";
import { useReleaseChannel } from "@/hooks/useReleaseChannel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function GitCommitPopover() {
  const [gitStatus, setGitStatus] = useState<GitWorkspaceUiStatus>(() => getGitWorkspaceUiStatus());
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [diffStat, setDiffStat] = useState("");
  const [busy, setBusy] = useState(false);
  const channel = useReleaseChannel();
  const beta = isBetaFeatureEnabled("git_commit", channel);

  useEffect(() => {
    const sync = () => setGitStatus(getGitWorkspaceUiStatus());
    window.addEventListener(GIT_WORKSPACE_STATUS_EVENT, sync);
    return () => window.removeEventListener(GIT_WORKSPACE_STATUS_EVENT, sync);
  }, []);

  const files = gitStatus.files ?? [];
  const chipClass = cn(
    "status-chip max-w-[220px]",
    gitStatus.conflict || gitStatus.conflictedPaths.length > 0
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : gitStatus.dirty
        ? "border-warning/30 bg-warning/10 text-warning"
        : "status-chip--active",
  );

  const selectedPaths = useMemo(() => files.map((file) => file.path), [files]);

  if (!gitStatus.root) return null;

  const refresh = async () => {
    const root = getGitWorkspaceRoot();
    if (!root) return;
    const status = await getGitWorkspaceStatus(root);
    patchGitWorkspaceUiStatus({
      root,
      branch: status.branch,
      dirty: status.dirty,
      ahead: status.ahead,
      behind: status.behind,
      conflictedPaths: status.conflicted,
      files: status.files ?? [],
    });
    const stat = await gitWorkspaceDiffStat(root).catch(() => "");
    setDiffStat(stat);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className={chipClass}
        title={
          gitStatus.conflict
            ? `Conflict: ${gitStatus.conflict.filePath}`
            : gitStatus.dirty
              ? beta
                ? "Open git commit panel"
                : "Workspace has uncommitted changes (Beta channel unlocks commit)"
              : "Workspace clean"
        }
        onClick={() => {
          if (!beta) {
            toast.info(
              "Beta channel",
              "Settings → Appearance → Release channel → Beta unlocks git commit.",
            );
            return;
          }
          setOpen((value) => !value);
          if (!open) void refresh();
        }}
      >
        {gitStatus.syncing ? (
          <LoaderCircle className="size-3 shrink-0 animate-spin" />
        ) : (
          <GitBranch className="size-3 shrink-0" />
        )}
        <span className="truncate font-mono">{gitStatus.branch ?? "…"}</span>
        {gitStatus.dirty && <span className="shrink-0">dirty</span>}
        {!gitStatus.dirty && !gitStatus.syncing && <span className="shrink-0">synced</span>}
        {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
          <span className="shrink-0 tabular-nums">
            {gitStatus.ahead > 0 ? `↑${gitStatus.ahead}` : ""}
            {gitStatus.behind > 0 ? `↓${gitStatus.behind}` : ""}
          </span>
        )}
      </button>

      {open && beta && (
        <div className="absolute bottom-9 left-0 z-50 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-border bg-background p-3 shadow-xl">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Git commit
          </p>
          <ul className="mt-2 max-h-28 space-y-0.5 overflow-auto font-mono text-[10px] text-muted-foreground">
            {files.length === 0 ? (
              <li>Working tree clean</li>
            ) : (
              files.slice(0, 40).map((file) => (
                <li key={file.path}>
                  <span className="text-foreground/80">{file.xy}</span> {file.path}
                </li>
              ))
            )}
          </ul>
          {diffStat && (
            <pre className="mt-2 max-h-20 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] leading-4">
              {diffStat}
            </pre>
          )}
          <textarea
            className="mt-2 h-16 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
            placeholder="Commit message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !message.trim() || selectedPaths.length === 0}
              onClick={() => {
                const root = getGitWorkspaceRoot();
                if (!root) return;
                setBusy(true);
                void gitWorkspaceAdd(root, selectedPaths)
                  .then(() => gitWorkspaceCommit(root, message.trim()))
                  .then((summary) => {
                    toast.success("Committed", summary || message.trim());
                    setMessage("");
                    setOpen(false);
                    return refresh();
                  })
                  .catch((error) =>
                    toast.error(
                      "Commit failed",
                      error instanceof Error ? error.message : String(error),
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Committing…" : "Stage & commit"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
