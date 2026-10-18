export type GitDiskConflict = {
  filePath: string;
  disk: string;
  editor: string;
};

export type GitWorkspaceUiStatus = {
  root: string | null;
  branch: string | null;
  dirty: boolean;
  syncing: boolean;
  ahead: number;
  behind: number;
  conflictedPaths: string[];
  conflict: GitDiskConflict | null;
  pendingCount: number;
};

export const GIT_WORKSPACE_STATUS_EVENT = "pulse:git-workspace-status";

const EMPTY: GitWorkspaceUiStatus = {
  root: null,
  branch: null,
  dirty: false,
  syncing: false,
  ahead: 0,
  behind: 0,
  conflictedPaths: [],
  conflict: null,
  pendingCount: 0,
};

let current: GitWorkspaceUiStatus = { ...EMPTY };

export function getGitWorkspaceUiStatus(): GitWorkspaceUiStatus {
  return current;
}

export function patchGitWorkspaceUiStatus(
  patch: Partial<GitWorkspaceUiStatus>,
): GitWorkspaceUiStatus {
  current = { ...current, ...patch };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GIT_WORKSPACE_STATUS_EVENT));
  }
  return current;
}

export function clearGitWorkspaceUiStatus(): void {
  current = { ...EMPTY };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GIT_WORKSPACE_STATUS_EVENT));
  }
}
