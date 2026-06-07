import { emit, listen } from "@tauri-apps/api/event";

export const WORKSPACE_UPDATED_EVENT = "workspace-updated";
export const WORKSPACE_RESET_EVENT = "workspace-reset";

export type WorkspaceUpdatedPayload = {
  sourceWindowId: string;
};

export type WorkspaceResetPayload = {
  sourceWindowId: string;
};

export async function emitWorkspaceUpdated(sourceWindowId: string): Promise<void> {
  await emit(WORKSPACE_UPDATED_EVENT, { sourceWindowId } satisfies WorkspaceUpdatedPayload);
}

export async function listenWorkspaceUpdated(
  handler: (payload: WorkspaceUpdatedPayload) => void,
): Promise<() => void> {
  const unlisten = await listen<WorkspaceUpdatedPayload>(WORKSPACE_UPDATED_EVENT, (event) => {
    handler(event.payload);
  });
  return unlisten;
}

export async function emitWorkspaceReset(sourceWindowId: string): Promise<void> {
  await emit(WORKSPACE_RESET_EVENT, { sourceWindowId } satisfies WorkspaceResetPayload);
}

export async function listenWorkspaceReset(
  handler: (payload: WorkspaceResetPayload) => void,
): Promise<() => void> {
  const unlisten = await listen<WorkspaceResetPayload>(WORKSPACE_RESET_EVENT, (event) => {
    handler(event.payload);
  });
  return unlisten;
}
