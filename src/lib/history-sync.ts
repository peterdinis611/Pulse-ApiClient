import { emit, listen } from "@tauri-apps/api/event";

export const HISTORY_UPDATED_EVENT = "history-updated";

export type HistoryUpdatedPayload = {
  sourceWindowId?: string;
};

export async function emitHistoryUpdated(sourceWindowId?: string): Promise<void> {
  await emit(HISTORY_UPDATED_EVENT, {
    sourceWindowId,
  } satisfies HistoryUpdatedPayload);
}

export async function listenHistoryUpdated(
  handler: (payload: HistoryUpdatedPayload) => void,
): Promise<() => void> {
  const unlisten = await listen<HistoryUpdatedPayload>(HISTORY_UPDATED_EVENT, (event) => {
    handler(event.payload);
  });
  return unlisten;
}
