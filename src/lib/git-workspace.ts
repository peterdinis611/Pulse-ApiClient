import { listen } from "@tauri-apps/api/event";
import type { CollectionGroup, Environment, KeyValue, SavedRequest } from "@/types";
import { invokeEffect } from "./effect/tauri";
import { runEffect } from "./effect/run";
import { canUseTauriIpc } from "./tauri-runtime";
import { normalizeRequest } from "./helpers";

export type GitWorkspacePayload = {
  name: string;
  root: string;
  collectionGroups: Array<Omit<CollectionGroup, "source"> & { source?: CollectionGroup["source"] }>;
  collections: Array<SavedRequest & { filePath?: string }>;
  environments: Environment[];
  secrets: KeyValue[];
};

export type WorkspaceFileChanged = {
  path: string;
  kind: string;
};

let gitWorkspaceRoot: string | null = null;
let secretsOverlay: KeyValue[] = [];

export function getGitWorkspaceRoot(): string | null {
  return gitWorkspaceRoot;
}

export function isGitWorkspaceActive(): boolean {
  return Boolean(gitWorkspaceRoot);
}

export function getSecretsOverlay(): KeyValue[] {
  return secretsOverlay;
}

export function setGitWorkspaceRoot(path: string | null): void {
  gitWorkspaceRoot = path;
  if (!path) secretsOverlay = [];
}

export function mapGitWorkspace(payload: GitWorkspacePayload): {
  collectionGroups: CollectionGroup[];
  collections: SavedRequest[];
  environments: Environment[];
  secrets: KeyValue[];
} {
  secretsOverlay = (payload.secrets ?? []).map((item) => ({
    ...item,
    secret: true,
    enabled: item.enabled !== false,
  }));
  setGitWorkspaceRoot(payload.root);
  return {
    collectionGroups: (payload.collectionGroups ?? []).map((group) => ({
      ...group,
      source: group.source ?? "pulse",
    })),
    collections: (payload.collections ?? []).map((item) => ({
      ...item,
      request: normalizeRequest(item.request),
      filePath: item.filePath,
    })),
    environments: payload.environments ?? [],
    secrets: secretsOverlay,
  };
}

export async function openGitWorkspace(root: string, name = "Pulse"): Promise<GitWorkspacePayload> {
  return runEffect(invokeEffect<GitWorkspacePayload>("git_workspace_open", { root, name }));
}

export async function loadGitWorkspace(root: string): Promise<GitWorkspacePayload> {
  return runEffect(invokeEffect<GitWorkspacePayload>("git_workspace_load", { root }));
}

export async function saveGitWorkspace(root: string, payload: GitWorkspacePayload): Promise<GitWorkspacePayload> {
  return runEffect(invokeEffect<GitWorkspacePayload>("git_workspace_save", { root, payload }));
}

export async function saveGitRequest(
  root: string,
  saved: SavedRequest,
  groupName: string,
): Promise<string> {
  return runEffect(
    invokeEffect<string>("git_workspace_save_request", { root, saved, groupName }),
  );
}

export async function migrateGitWorkspace(root: string): Promise<string[]> {
  return runEffect(invokeEffect<string[]>("git_workspace_migrate", { root }));
}

export async function watchGitWorkspace(root: string): Promise<void> {
  await runEffect(invokeEffect<void>("git_workspace_watch", { root }));
}

export async function unwatchGitWorkspace(): Promise<void> {
  await runEffect(invokeEffect<void>("git_workspace_unwatch"));
}

export async function readGitWorkspaceFile(root: string, relative: string): Promise<string> {
  return runEffect(invokeEffect<string>("git_workspace_read_file", { root, relative }));
}

export async function listenGitWorkspaceChanges(
  onChange: (event: WorkspaceFileChanged) => void,
): Promise<() => void> {
  if (!canUseTauriIpc()) return () => undefined;
  const unlisten = await listen<WorkspaceFileChanged>("workspace-file-changed", (event) => {
    onChange(event.payload);
  });
  return unlisten;
}

export async function listGitPending(root: string): Promise<string[]> {
  return runEffect(invokeEffect<string[]>("git_workspace_pending", { root }));
}

export async function listGitAgentHistory(root: string): Promise<unknown[]> {
  return runEffect(invokeEffect<unknown[]>("git_workspace_agent_history", { root }));
}

export function collectionsFolderAvailable(): boolean {
  return canUseTauriIpc();
}
