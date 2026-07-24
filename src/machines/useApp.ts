import { useCallback } from "react";
import type {
  ApiRequest,
  Environment,
  HistoryEntry,
  MainView,
  RequestTab,
  SavedRequest,
} from "@/types";
import type { OverviewFilter } from "@/lib/filters";
import { defaultWebSocketSession } from "@/lib/protocol";
import type { WebSocketSession } from "@/types";
import { createRequest } from "@/lib/helpers";
import type { UserSession } from "@/lib/auth";
import type { TestRunResult } from "@/types";
import { exportCollectionJson, exportEnvironmentsJson, type PersistedState } from "@/lib/storage";
import { exportPostmanCollection } from "@/lib/postman-export";
import { exportPulseCollection } from "@/lib/pulse-collection";
import type { ThemeMode } from "@/lib/theme";
import { AppMachineContext } from "@/machines/AppProvider";
import {
  selectActiveEnvironment,
  selectActiveTab,
  selectWorkspaceEnvironment,
  flushWorkspaceFromContext,
} from "@/machines/appMachine";

export function useApp() {
  const actorRef = AppMachineContext.useActorRef();
  const snapshot = AppMachineContext.useSelector((state) => state);
  const context = snapshot.context;
  const activeTab = selectActiveTab(context);
  const activeEnvironment = selectActiveEnvironment(context);
  const workspaceEnvironment = selectWorkspaceEnvironment(context);

  const send = useCallback((event: Parameters<typeof actorRef.send>[0]) => {
    actorRef.send(event);
  }, [actorRef]);

  return {
    tabs: context.tabs,
    activeTabId: context.activeTabId,
    request: activeTab?.request ?? createRequest(),
    response: activeTab?.response ?? null,
    error: activeTab?.error ?? null,
    testResults: activeTab?.testResults ?? null,
    loading: activeTab?.loading ?? false,
    pendingRequestCount: context.tabs.filter((tab) => tab.loading).length,
    requestTab: context.requestTab,
    mainView: context.mainView,
    sidebarSearch: context.sidebarSearch,
    consoleOpen: context.consoleOpen,
    responsePanelOpen: context.responsePanelOpen,
    theme: context.theme,
    explorerCollapsed: context.explorerCollapsed,
    explorerWidth: context.explorerWidth,
    user: context.user,
    overviewFilter: context.overviewFilter,
    collectionGroups: context.persisted.collectionGroups,
    activeCollectionId: context.persisted.activeCollectionId,
    collections: context.persisted.collections,
    environments: context.persisted.environments,
    activeEnvironmentId: context.persisted.activeEnvironmentId,
    activeEnvironment,
    workspaceEnvironment,
    tabEnvironmentOverrideId: activeTab?.environmentId ?? null,

    ws: (activeTab?.ws ?? defaultWebSocketSession()) as WebSocketSession,

    setRequestTab: (tab: RequestTab) => send({ type: "SET_REQUEST_TAB", tab }),
    setMainView: (view: MainView) => send({ type: "SET_MAIN_VIEW", view }),
    setSidebarSearch: (value: string) => send({ type: "SET_SIDEBAR_SEARCH", value }),
    setConsoleOpen: (open: boolean) => send({ type: "SET_CONSOLE_OPEN", open }),
    setResponsePanelOpen: (open: boolean) => send({ type: "SET_RESPONSE_PANEL_OPEN", open }),
    setOverviewFilter: (patch: Partial<OverviewFilter>) =>
      send({ type: "SET_OVERVIEW_FILTER", patch }),
    resetOverviewFilter: () => send({ type: "RESET_OVERVIEW_FILTER" }),
    setTheme: (theme: ThemeMode) => send({ type: "SET_THEME", theme }),
    setExplorerCollapsed: (collapsed: boolean) =>
      send({ type: "SET_EXPLORER_COLLAPSED", collapsed }),
    toggleExplorerCollapsed: () => send({ type: "TOGGLE_EXPLORER_COLLAPSED" }),
    setExplorerWidth: (width: number) => send({ type: "SET_EXPLORER_WIDTH", width }),
    signIn: (user: UserSession, persisted: PersistedState) =>
      send({ type: "SIGN_IN", user, persisted }),
    signOut: () => send({ type: "SIGN_OUT" }),
    flushWorkspace: async () => {
      await flushWorkspaceFromContext(actorRef.getSnapshot().context);
    },
    setTestResults: (results: TestRunResult | null) =>
      send({ type: "SET_TEST_RESULTS", results }),
    updateRequest: (patch: Partial<ApiRequest>) => send({ type: "UPDATE_REQUEST", patch }),
    openRequestTab: (request: ApiRequest) => send({ type: "OPEN_REQUEST_TAB", request }),
    newRequestTab: () => send({ type: "NEW_REQUEST_TAB" }),
    closeTab: (tabId: string) => send({ type: "CLOSE_TAB", tabId }),
    setActiveTab: (tabId: string) => send({ type: "SET_ACTIVE_TAB", tabId }),
    sendCurrentRequest: () => send({ type: "SEND" }),
    connectWebSocket: () => send({ type: "WS_CONNECT" }),
    disconnectWebSocket: () => send({ type: "WS_DISCONNECT" }),
    sendWebSocketMessage: (data: string, binary?: boolean) =>
      send({ type: "WS_SEND", data, binary }),
    sendWebSocketPing: () => send({ type: "WS_PING" }),
    cancelCurrentRequest: () => send({ type: "CANCEL_SEND" }),
    saveCurrentToCollection: (folder?: string) => send({ type: "SAVE_TO_COLLECTION", folder }),
    loadSavedRequest: (saved: SavedRequest) => send({ type: "LOAD_SAVED_REQUEST", saved }),
    deleteSavedRequest: (id: string) => send({ type: "DELETE_SAVED_REQUEST", id }),
    duplicateSavedRequest: (id: string) => send({ type: "DUPLICATE_SAVED_REQUEST", id }),
    exportCollections: () =>
      exportCollectionJson({
        collectionGroups: context.persisted.collectionGroups,
        collections: context.persisted.collections,
      }),
    exportCollection: (collectionId: string, format: "pulse" | "postman") => {
      const group = context.persisted.collectionGroups.find((item) => item.id === collectionId);
      if (!group) return null;

      const items = context.persisted.collections.filter((item) => item.collectionId === collectionId);
      if (format === "postman") {
        return exportPostmanCollection(group, items);
      }

      return exportPulseCollection(group, items);
    },
    importCollections: (raw: string) => send({ type: "IMPORT_COLLECTIONS", raw }),
    importPostmanCollection: (raw: string) => send({ type: "IMPORT_POSTMAN", raw }),
    importBrunoCollection: (raw: string) => send({ type: "IMPORT_BRUNO", raw }),
    importInsomniaCollection: (raw: string) => send({ type: "IMPORT_INSOMNIA", raw }),
    importOpenApiCollection: (raw: string) => send({ type: "IMPORT_OPENAPI", raw }),
    importEnvironments: (raw: string) => send({ type: "IMPORT_ENVIRONMENTS", raw }),
    exportEnvironments: () => exportEnvironmentsJson(context.persisted.environments),
    addCollectionGroup: (name: string) => send({ type: "ADD_COLLECTION_GROUP", name }),
    deleteCollectionGroup: (id: string) => send({ type: "DELETE_COLLECTION_GROUP", id }),
    renameCollectionGroup: (id: string, name: string) =>
      send({ type: "RENAME_COLLECTION_GROUP", id, name }),
    setActiveCollectionId: (id: string | null) => send({ type: "SET_ACTIVE_COLLECTION", id }),
    addFolder: (collectionId: string, folderPath: string) =>
      send({ type: "ADD_FOLDER", collectionId, folderPath }),
    deleteFolder: (collectionId: string, folderPath: string) =>
      send({ type: "DELETE_FOLDER", collectionId, folderPath }),
    moveSavedRequest: (id: string, collectionId: string, folder?: string) =>
      send({ type: "MOVE_SAVED_REQUEST", id, collectionId, folder }),
    setActiveEnvironmentId: (id: string | null) => send({ type: "SET_ACTIVE_ENVIRONMENT", id }),
    setTabEnvironmentOverrideId: (environmentId: string | null) =>
      send({ type: "SET_TAB_ENVIRONMENT", environmentId }),
    addEnvironment: () => send({ type: "ADD_ENVIRONMENT" }),
    updateEnvironment: (id: string, patch: Partial<Environment>) =>
      send({ type: "UPDATE_ENVIRONMENT", id, patch }),
    deleteEnvironment: (id: string) => send({ type: "DELETE_ENVIRONMENT", id }),
    updateEnvironmentVariable: (
      envId: string,
      variableId: string,
      patch: Partial<Environment["variables"][number]>,
    ) => send({ type: "UPDATE_ENVIRONMENT_VARIABLE", envId, variableId, patch }),
    addEnvironmentVariable: (envId: string) => send({ type: "ADD_ENVIRONMENT_VARIABLE", envId }),
    removeEnvironmentVariable: (envId: string, variableId: string) =>
      send({ type: "REMOVE_ENVIRONMENT_VARIABLE", envId, variableId }),
    loadHistoryEntry: (entry: HistoryEntry) => send({ type: "LOAD_HISTORY_ENTRY", entry }),
    clearHistory: () => send({ type: "CLEAR_HISTORY" }),
    resetWorkspace: () => send({ type: "RESET_WORKSPACE" }),
    windowId: context.windowId,
  };
}
