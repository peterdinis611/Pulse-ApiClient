import { useCallback, useMemo } from "react";
import type { EventFrom, SnapshotFrom } from "xstate";
import { AppMachineContext } from "@/machines/AppProvider";
import { appMachine } from "@/machines/appMachine";
import { exportCollectionJson, exportEnvironmentsJson } from "@/lib/storage";
import { exportPostmanCollection } from "@/lib/postman-export";
import { exportBrunoCollection } from "@/lib/bruno-export";
import { exportInsomniaCollection } from "@/lib/insomnia-export";
import { exportPulseCollection } from "@/lib/pulse-collection";
import { exportOpenApiCollection } from "@/lib/openapi-export";
import type {
  ApiRequest,
  CollectionGroup,
  FolderConfig,
  HistoryEntry,
  MainView,
  SavedRequest,
} from "@/types";

type AppSnapshot = SnapshotFrom<typeof appMachine>;
type AppEvent = EventFrom<typeof appMachine>;

/** Narrow subscription — re-renders only when the selected value changes. */
export function useAppSelector<T>(
  selector: (snapshot: AppSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  return AppMachineContext.useSelector(selector, isEqual);
}

/** Stable send — does not subscribe to machine context. */
export function useAppSend() {
  const actorRef = AppMachineContext.useActorRef();
  return useCallback((event: AppEvent) => {
    actorRef.send(event);
  }, [actorRef]);
}

/**
 * Stable action bag (send + snapshot reads). Does not re-render on context changes.
 * Pair with `useAppSelector` for the data you display.
 */
export function useAppActions() {
  const actorRef = AppMachineContext.useActorRef();
  const send = useCallback((event: AppEvent) => {
    actorRef.send(event);
  }, [actorRef]);

  return useMemo(
    () => ({
      send,
      updateRequest: (patch: Partial<ApiRequest>) => send({ type: "UPDATE_REQUEST", patch }),
      sendCurrentRequest: () => send({ type: "SEND" }),
      cancelCurrentRequest: () => send({ type: "CANCEL_SEND" }),
      connectWebSocket: () => send({ type: "WS_CONNECT" }),
      disconnectWebSocket: () => send({ type: "WS_DISCONNECT" }),
      saveCurrentToCollection: (folder?: string) => send({ type: "SAVE_TO_COLLECTION", folder }),
      openRequestTab: (
        request: ApiRequest,
        extras?: { collectionId?: string | null; folder?: string | null; savedRequestId?: string | null },
      ) =>
        send({
          type: "OPEN_REQUEST_TAB",
          request,
          collectionId: extras?.collectionId,
          folder: extras?.folder,
          savedRequestId: extras?.savedRequestId,
        }),
      setMainView: (view: MainView) => send({ type: "SET_MAIN_VIEW", view }),
      setConsoleOpen: (open: boolean) => send({ type: "SET_CONSOLE_OPEN", open }),
      setSidebarSearch: (value: string) => send({ type: "SET_SIDEBAR_SEARCH", value }),
      toggleExplorerCollapsed: () => send({ type: "TOGGLE_EXPLORER_COLLAPSED" }),
      setActiveCollectionId: (id: string | null) => send({ type: "SET_ACTIVE_COLLECTION", id }),
      setActiveEnvironmentId: (id: string | null) => send({ type: "SET_ACTIVE_ENVIRONMENT", id }),
      loadSavedRequest: (saved: SavedRequest) => send({ type: "LOAD_SAVED_REQUEST", saved }),
      deleteSavedRequest: (id: string) => send({ type: "DELETE_SAVED_REQUEST", id }),
      duplicateSavedRequest: (id: string) => send({ type: "DUPLICATE_SAVED_REQUEST", id }),
      loadHistoryEntry: (entry: HistoryEntry) => send({ type: "LOAD_HISTORY_ENTRY", entry }),
      clearHistory: () => send({ type: "CLEAR_HISTORY" }),
      importCollections: (raw: string) => send({ type: "IMPORT_COLLECTIONS", raw }),
      addEnvironment: () => send({ type: "ADD_ENVIRONMENT" }),
      deleteFolder: (collectionId: string, folderPath: string) =>
        send({ type: "DELETE_FOLDER", collectionId, folderPath }),
      patchCollectionGroup: (id: string, patch: Partial<CollectionGroup>) =>
        send({ type: "PATCH_COLLECTION_GROUP", id, patch }),
      patchFolderConfig: (collectionId: string, path: string, patch: Partial<FolderConfig>) =>
        send({ type: "PATCH_FOLDER_CONFIG", collectionId, path, patch }),
      relocateSavedRequest: (
        id: string,
        collectionId: string,
        options: {
          folder?: string;
          targetId?: string | null;
          position?: "before" | "after";
        } = {},
      ) =>
        send({
          type: "RELOCATE_SAVED_REQUEST",
          id,
          collectionId,
          folder: options.folder,
          targetId: options.targetId,
          position: options.position,
        }),
      reorderFolder: (
        collectionId: string,
        path: string,
        targetPath: string,
        position: "before" | "after",
      ) => send({ type: "REORDER_FOLDER", collectionId, path, targetPath, position }),
      newRequestTab: () => send({ type: "NEW_REQUEST_TAB" }),
      saveResponseExample: (name?: string) => send({ type: "SAVE_RESPONSE_EXAMPLE", name }),
      upsertEnvironmentVariable: (key: string, value: string) =>
        send({ type: "UPSERT_ENVIRONMENT_VARIABLE", key, value }),
      exportCollections: () => {
        const { collectionGroups, collections } = actorRef.getSnapshot().context.persisted;
        return exportCollectionJson({ collectionGroups, collections });
      },
      exportCollection: async (
        collectionId: string,
        format: "pulse" | "postman" | "openapi" | "bruno" | "insomnia",
      ): Promise<string | null> => {
        const { collectionGroups, collections } = actorRef.getSnapshot().context.persisted;
        const group = collectionGroups.find((item) => item.id === collectionId);
        if (!group) return null;
        const items = collections.filter((item) => item.collectionId === collectionId);
        if (format === "postman") return exportPostmanCollection(group, items);
        if (format === "openapi") return exportOpenApiCollection(group, items);
        if (format === "bruno") return exportBrunoCollection(group, items);
        if (format === "insomnia") return exportInsomniaCollection(group, items);
        return exportPulseCollection(group, items);
      },
      exportEnvironments: () =>
        exportEnvironmentsJson(actorRef.getSnapshot().context.persisted.environments),
    }),
    [actorRef, send],
  );
}

export function shallowEqualAppSlice<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
