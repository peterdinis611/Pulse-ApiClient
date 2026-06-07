import { assign, raise, setup } from "xstate";
import type {
  ApiRequest,
  Environment,
  HistoryEntry,
  HttpResponse,
  MainView,
  RequestTab,
  RequestTabState,
  SavedRequest,
  TestRunResult,
  WebSocketMessage,
} from "@/types";
import {
  addFolderToCollection,
  createCollectionGroup,
  removeFolderFromCollection,
} from "@/lib/collections";
import {
  createHistoryEntry,
  createId,
  createKeyValue,
  createRequest,
  createSavedRequest,
} from "@/lib/helpers";
import { cancelHttpRequest, sendRequest } from "@/lib/http-client";
import type { OverviewFilter } from "@/lib/filters";
import { defaultOverviewFilter } from "@/lib/filters";
import {
  clearUserSession,
  saveUserSession,
  type UserSession,
} from "@/lib/auth";
import {
  buildWindowSession,
  defaultPersistedState,
  importCollectionJson,
  importPostmanIntoState,
  savePersistedState,
  type PersistedState,
} from "@/lib/storage";
import type { PendingWindowInit } from "@/lib/window-manager";
import { loadThemeMode, saveThemeMode, type ThemeMode } from "@/lib/theme";
import { defaultWebSocketSession, inferProtocolFromUrl } from "@/lib/protocol";
import { toast } from "@/lib/toast";
import { wsClose, wsConnect, wsSend } from "@/lib/ws-client";

export function createTabState(request = createRequest()): RequestTabState {
  return {
    id: createId("tab"),
    request,
    response: null,
    error: null,
    loading: false,
    inFlightRequestId: null,
    testResults: null,
    ws: defaultWebSocketSession(),
  };
}

export type AppMachineContext = {
  windowId: string;
  persisted: PersistedState;
  tabs: RequestTabState[];
  activeTabId: string;
  requestTab: RequestTab;
  mainView: MainView;
  sidebarSearch: string;
  consoleOpen: boolean;
  responsePanelOpen: boolean;
  theme: ThemeMode;
  user: UserSession | null;
  overviewFilter: OverviewFilter;
};

type SendInput = {
  tabId: string;
  requestId: string;
  request: ApiRequest;
  environment: Environment | null;
};

function patchRequest(request: ApiRequest, patch: Partial<ApiRequest>): ApiRequest {
  const next = { ...request, ...patch };
  if (patch.url !== undefined) {
    next.protocol = inferProtocolFromUrl(patch.url);
  }
  return next;
}

function appendWsMessage(
  tab: RequestTabState,
  message: WebSocketMessage,
): RequestTabState {
  return {
    ...tab,
    ws: {
      ...tab.ws,
      messages: [...tab.ws.messages, message],
    },
  };
}

function startTabWebSocketConnect(
  self: { send: (event: AppMachineEvent) => void },
  input: { tabId: string; request: ApiRequest; environment: Environment | null },
) {
  void wsConnect(input.tabId, input.request, input.environment)
    .then((result) => {
      self.send({
        type: "WS_CONNECT_COMPLETE",
        tabId: input.tabId,
        connectionId: result.connectionId,
        status: result.status,
        headers: result.headers,
      });
    })
    .catch((error) => {
      self.send({
        type: "WS_CONNECT_FAILED",
        tabId: input.tabId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

function disconnectTabWebSocket(tab: RequestTabState) {
  if (tab.ws.connectionId) {
    void wsClose(tab.ws.connectionId);
  }
}

function normalizeTabState(tab: RequestTabState): RequestTabState {
  return {
    ...tab,
    ws: tab.ws ?? defaultWebSocketSession(),
    request: {
      ...tab.request,
      protocol: tab.request.protocol ?? inferProtocolFromUrl(tab.request.url),
    },
  };
}

function mapTabById(
  context: AppMachineContext,
  tabId: string,
  updater: (tab: RequestTabState) => RequestTabState,
): RequestTabState[] {
  return context.tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab));
}

function startTabRequest(
  self: { send: (event: AppMachineEvent) => void },
  input: SendInput,
) {
  void sendRequest(input.request, input.environment, { requestId: input.requestId })
    .then(async (response) => {
      const historyEntry = createHistoryEntry(input.request, {
        status: response.status,
        elapsedMs: response.elapsedMs,
        sizeBytes: response.sizeBytes,
      });

      self.send({
        type: "SEND_COMPLETE",
        tabId: input.tabId,
        requestId: input.requestId,
        response,
        historyEntry,
        testResults: null,
      });
    })
    .catch((error) => {
      self.send({
        type: "SEND_FAILED",
        tabId: input.tabId,
        requestId: input.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

export type AppMachineEvent =
  | { type: "SET_REQUEST_TAB"; tab: RequestTab }
  | { type: "SET_MAIN_VIEW"; view: MainView }
  | { type: "SET_SIDEBAR_SEARCH"; value: string }
  | { type: "SET_CONSOLE_OPEN"; open: boolean }
  | { type: "SET_RESPONSE_PANEL_OPEN"; open: boolean }
  | { type: "UPDATE_REQUEST"; patch: Partial<ApiRequest> }
  | { type: "OPEN_REQUEST_TAB"; request: ApiRequest }
  | { type: "NEW_REQUEST_TAB" }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "SET_ACTIVE_TAB"; tabId: string }
  | { type: "SEND" }
  | { type: "SEND_STARTED"; tabId: string; requestId: string }
  | {
      type: "SEND_COMPLETE";
      tabId: string;
      requestId: string;
      response: HttpResponse;
      historyEntry: HistoryEntry;
      testResults: TestRunResult | null;
    }
  | { type: "SEND_FAILED"; tabId: string; requestId: string; error: string }
  | { type: "CANCEL_SEND"; tabId?: string }
  | { type: "WS_CONNECT" }
  | { type: "WS_CONNECT_STARTED"; tabId: string }
  | {
      type: "WS_CONNECT_COMPLETE";
      tabId: string;
      connectionId: string;
      status: number;
      headers: HttpResponse["headers"];
    }
  | { type: "WS_CONNECT_FAILED"; tabId: string; error: string }
  | { type: "WS_DISCONNECT"; tabId?: string }
  | { type: "WS_SEND"; data: string }
  | {
      type: "WS_MESSAGE_RECEIVED";
      connectionId: string;
      tabId: string;
      data: string;
      binary: boolean;
      timestamp: number;
    }
  | {
      type: "WS_CLOSED";
      connectionId: string;
      tabId: string;
      code?: number;
      reason?: string;
    }
  | { type: "WS_ERROR"; connectionId: string; tabId: string; message: string }
  | { type: "SAVE_TO_COLLECTION" }
  | { type: "LOAD_SAVED_REQUEST"; saved: SavedRequest }
  | { type: "DELETE_SAVED_REQUEST"; id: string }
  | { type: "DUPLICATE_SAVED_REQUEST"; id: string }
  | { type: "IMPORT_COLLECTIONS"; raw: string }
  | { type: "IMPORT_POSTMAN"; raw: string }
  | { type: "ADD_COLLECTION_GROUP"; name: string }
  | { type: "DELETE_COLLECTION_GROUP"; id: string }
  | { type: "RENAME_COLLECTION_GROUP"; id: string; name: string }
  | { type: "SET_ACTIVE_COLLECTION"; id: string | null }
  | { type: "ADD_FOLDER"; collectionId: string; folderPath: string }
  | { type: "DELETE_FOLDER"; collectionId: string; folderPath: string }
  | { type: "MOVE_SAVED_REQUEST"; id: string; collectionId: string; folder?: string }
  | { type: "SET_ACTIVE_ENVIRONMENT"; id: string | null }
  | { type: "ADD_ENVIRONMENT" }
  | { type: "UPDATE_ENVIRONMENT"; id: string; patch: Partial<Environment> }
  | { type: "DELETE_ENVIRONMENT"; id: string }
  | {
      type: "UPDATE_ENVIRONMENT_VARIABLE";
      envId: string;
      variableId: string;
      patch: Partial<Environment["variables"][number]>;
    }
  | { type: "ADD_ENVIRONMENT_VARIABLE"; envId: string }
  | { type: "REMOVE_ENVIRONMENT_VARIABLE"; envId: string; variableId: string }
  | { type: "LOAD_HISTORY_ENTRY"; entry: HistoryEntry }
  | { type: "CLEAR_HISTORY" }
  | { type: "SET_THEME"; theme: ThemeMode }
  | { type: "HYDRATE_APP"; persisted: PersistedState; user: UserSession | null; windowId: string; pendingInit?: PendingWindowInit | null }
  | { type: "SYNC_WORKSPACE"; persisted: PersistedState }
  | { type: "RESET_WORKSPACE" }
  | { type: "PERSIST_WINDOW_SESSION" }
  | { type: "SET_OVERVIEW_FILTER"; patch: Partial<OverviewFilter> }
  | { type: "RESET_OVERVIEW_FILTER" }
  | { type: "SIGN_IN"; user: UserSession }
  | { type: "SIGN_OUT" }
  | { type: "SET_TEST_RESULTS"; results: TestRunResult | null };

function createInitialContext(): AppMachineContext {
  const persisted = defaultPersistedState();
  const initialTab = createTabState(persisted.lastRequest);
  return {
    windowId: "main",
    persisted,
    tabs: [initialTab],
    activeTabId: initialTab.id,
    requestTab: "params",
    mainView: "overview",
    sidebarSearch: "",
    consoleOpen: false,
    responsePanelOpen: true,
    theme: loadThemeMode(),
    user: null,
    overviewFilter: defaultOverviewFilter(),
  };
}

function getActiveTab(context: AppMachineContext): RequestTabState | undefined {
  return context.tabs.find((tab) => tab.id === context.activeTabId) ?? context.tabs[0];
}

function getActiveEnvironment(context: AppMachineContext): Environment | null {
  return (
    context.persisted.environments.find(
      (env) => env.id === context.persisted.activeEnvironmentId,
    ) ??
    context.persisted.environments[0] ??
    null
  );
}

function buildPersistedFromContext(
  context: AppMachineContext,
  patch?: Partial<PersistedState>,
): PersistedState {
  const activeTab = getActiveTab(context);
  const session = buildWindowSession({
    tabs: context.tabs,
    activeTabId: context.activeTabId,
    mainView: context.mainView,
    requestTab: context.requestTab,
    consoleOpen: context.consoleOpen,
    responsePanelOpen: context.responsePanelOpen,
    sidebarSearch: context.sidebarSearch,
  });

  return {
    ...context.persisted,
    ...patch,
    lastRequest: activeTab?.request ?? context.persisted.lastRequest,
    windowSessions: {
      ...context.persisted.windowSessions,
      [context.windowId]: session,
    },
  };
}

function persistLastRequest(context: AppMachineContext, broadcast = false) {
  void savePersistedState(buildPersistedFromContext(context), {
    sourceWindowId: context.windowId,
    broadcast,
  });
}

function saveSharedWorkspace(context: AppMachineContext, patch: Partial<PersistedState>) {
  void savePersistedState(buildPersistedFromContext(context, patch), {
    sourceWindowId: context.windowId,
    broadcast: true,
  });
}

function mapActiveTab(
  context: AppMachineContext,
  updater: (tab: RequestTabState) => RequestTabState,
): RequestTabState[] {
  return context.tabs.map((tab) => (tab.id === context.activeTabId ? updater(tab) : tab));
}

export const appMachine = setup({
  types: {
    context: {} as AppMachineContext,
    events: {} as AppMachineEvent,
  },
  actions: {
    persistLastRequest: ({ context }) => persistLastRequest(context),
    startActiveTabRequest: ({ context, self }) => {
      const tab = getActiveTab(context);
      if (!tab || tab.loading || !tab.request.url.trim()) return;
      if (tab.request.protocol === "websocket") return;

      const requestId = createId("http");
      self.send({ type: "SEND_STARTED", tabId: tab.id, requestId });
      startTabRequest(self, {
        tabId: tab.id,
        requestId,
        request: tab.request,
        environment: getActiveEnvironment(context),
      });
    },
    startActiveTabWebSocket: ({ context, self }) => {
      const tab = getActiveTab(context);
      if (!tab || tab.ws.status === "connecting" || tab.ws.status === "open") return;
      if (!tab.request.url.trim()) return;

      self.send({ type: "WS_CONNECT_STARTED", tabId: tab.id });
      startTabWebSocketConnect(self, {
        tabId: tab.id,
        request: tab.request,
        environment: getActiveEnvironment(context),
      });
    },
  },
}).createMachine({
  id: "app",
  context: createInitialContext,
  initial: "ready",
  states: {
    ready: {
      on: {
        SET_REQUEST_TAB: {
          actions: assign({ requestTab: ({ event }) => event.tab }),
        },
        SET_MAIN_VIEW: {
          actions: assign({ mainView: ({ event }) => event.view }),
        },
        SET_SIDEBAR_SEARCH: {
          actions: assign({
            sidebarSearch: ({ event }) => event.value,
            overviewFilter: ({ context, event }) => ({
              ...context.overviewFilter,
              query: event.value,
            }),
          }),
        },
        SET_CONSOLE_OPEN: {
          actions: assign({ consoleOpen: ({ event }) => event.open }),
        },
        SET_RESPONSE_PANEL_OPEN: {
          actions: assign({ responsePanelOpen: ({ event }) => event.open }),
        },
        UPDATE_REQUEST: {
          actions: [
            assign({
              tabs: ({ context, event }) =>
                mapActiveTab(context, (tab) => ({
                  ...tab,
                  request: patchRequest(tab.request, event.patch),
                })),
            }),
            "persistLastRequest",
          ],
        },
        OPEN_REQUEST_TAB: {
          actions: assign(({ context, event }) => {
            const existing = context.tabs.find((tab) => tab.request.id === event.request.id);
            if (existing) {
              persistLastRequest(context);
              return {
                activeTabId: existing.id,
                mainView: "request" as const,
              };
            }
            const next = createTabState(structuredClone(event.request));
            const nextContext = {
              ...context,
              tabs: [...context.tabs, next],
              activeTabId: next.id,
              mainView: "request" as const,
            };
            persistLastRequest(nextContext);
            return {
              tabs: nextContext.tabs,
              activeTabId: next.id,
              mainView: "request" as const,
            };
          }),
        },
        NEW_REQUEST_TAB: {
          actions: assign(({ context }) => {
            const next = createTabState();
            const nextContext = {
              ...context,
              tabs: [...context.tabs, next],
              activeTabId: next.id,
              mainView: "request" as const,
            };
            persistLastRequest(nextContext);
            return {
              tabs: nextContext.tabs,
              activeTabId: next.id,
              mainView: "request" as const,
            };
          }),
        },
        CLOSE_TAB: {
          actions: [
            ({ context, event }) => {
              const closing = context.tabs.find((tab) => tab.id === event.tabId);
              if (closing) disconnectTabWebSocket(closing);
            },
            assign(({ context, event }) => {
            if (context.tabs.length === 1) {
              const reset = createTabState();
              const nextContext = {
                ...context,
                tabs: [reset],
                activeTabId: reset.id,
                mainView: "overview" as const,
              };
              persistLastRequest(nextContext);
              return {
                tabs: [reset],
                activeTabId: reset.id,
                mainView: "overview" as const,
              };
            }

            const index = context.tabs.findIndex((tab) => tab.id === event.tabId);
            const tabs = context.tabs.filter((tab) => tab.id !== event.tabId);
            const activeTabId =
              event.tabId === context.activeTabId
                ? (tabs[Math.max(0, index - 1)]?.id ?? tabs[0]?.id)
                : context.activeTabId;

            const nextContext = { ...context, tabs, activeTabId };
            persistLastRequest(nextContext);
            return { tabs, activeTabId };
          }),
          ],
        },
        SET_ACTIVE_TAB: {
          actions: [
            assign({
              activeTabId: ({ event }) => event.tabId,
              mainView: "request",
            }),
            "persistLastRequest",
          ],
        },
        SAVE_TO_COLLECTION: {
          actions: [
            assign(({ context }) => {
              const activeTab = getActiveTab(context);
              if (!activeTab) return {};

              const collectionId =
                context.persisted.activeCollectionId ?? context.persisted.collectionGroups[0]?.id;
              if (!collectionId) return {};

              const saved = createSavedRequest(
                {
                  ...activeTab.request,
                  name: activeTab.request.name || "Untitled Request",
                },
                { collectionId },
              );

              const persisted = {
                ...context.persisted,
                collections: [saved, ...context.persisted.collections],
              };
              saveSharedWorkspace(context, persisted);
              return { persisted };
            }),
            ({ context }) => {
              const activeTab = getActiveTab(context);
              if (!activeTab) return;
              const name = activeTab.request.name || "Untitled Request";
              toast.success("Saved to collection", name);
            },
          ],
        },
        LOAD_SAVED_REQUEST: {
          actions: raise(({ event }) => ({
            type: "OPEN_REQUEST_TAB" as const,
            request: structuredClone(event.saved.request),
          })),
        },
        DELETE_SAVED_REQUEST: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              collections: context.persisted.collections.filter((item) => item.id !== event.id),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        DUPLICATE_SAVED_REQUEST: {
          actions: assign(({ context, event }) => {
            const source = context.persisted.collections.find((item) => item.id === event.id);
            if (!source) return {};
            const copy = createSavedRequest(structuredClone(source.request), {
              collectionId: source.collectionId,
              folder: source.folder,
              name: `${source.name} Copy`,
            });
            const persisted = {
              ...context.persisted,
              collections: [copy, ...context.persisted.collections],
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        IMPORT_COLLECTIONS: {
          actions: assign(({ context, event }) => {
            const imported = importCollectionJson(event.raw, context.persisted);
            const persisted = {
              ...context.persisted,
              ...imported,
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        IMPORT_POSTMAN: {
          actions: assign(({ context, event }) => {
            const persisted = importPostmanIntoState(event.raw, context.persisted);
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        ADD_COLLECTION_GROUP: {
          actions: assign(({ context, event }) => {
            const group = createCollectionGroup(event.name);
            const persisted = {
              ...context.persisted,
              collectionGroups: [...context.persisted.collectionGroups, group],
              activeCollectionId: group.id,
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        DELETE_COLLECTION_GROUP: {
          actions: assign(({ context, event }) => {
            const collectionGroups = context.persisted.collectionGroups.filter(
              (group) => group.id !== event.id,
            );
            const fallbackGroups = collectionGroups.length
              ? collectionGroups
              : defaultPersistedState().collectionGroups;
            const fallbackId = fallbackGroups[0]?.id ?? null;
            const persisted = {
              ...context.persisted,
              collectionGroups: fallbackGroups,
              activeCollectionId:
                context.persisted.activeCollectionId === event.id
                  ? fallbackId
                  : context.persisted.activeCollectionId,
              collections: context.persisted.collections.filter(
                (item) => item.collectionId !== event.id,
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        RENAME_COLLECTION_GROUP: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              collectionGroups: context.persisted.collectionGroups.map((group) =>
                group.id === event.id ? { ...group, name: event.name } : group,
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        SET_ACTIVE_COLLECTION: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              activeCollectionId: event.id,
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        ADD_FOLDER: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              collectionGroups: context.persisted.collectionGroups.map((group) =>
                group.id === event.collectionId
                  ? addFolderToCollection(group, event.folderPath)
                  : group,
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        DELETE_FOLDER: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              collectionGroups: context.persisted.collectionGroups.map((group) =>
                group.id === event.collectionId
                  ? removeFolderFromCollection(group, event.folderPath)
                  : group,
              ),
              collections: context.persisted.collections.map((item) =>
                item.collectionId === event.collectionId &&
                (item.folder === event.folderPath ||
                  item.folder?.startsWith(`${event.folderPath}/`))
                  ? { ...item, folder: undefined }
                  : item,
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        MOVE_SAVED_REQUEST: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              collections: context.persisted.collections.map((item) =>
                item.id === event.id
                  ? {
                      ...item,
                      collectionId: event.collectionId,
                      folder: event.folder,
                    }
                  : item,
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        SET_ACTIVE_ENVIRONMENT: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              activeEnvironmentId: event.id,
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        ADD_ENVIRONMENT: {
          actions: assign(({ context }) => {
            const env = {
              id: createId("env"),
              name: `Environment ${context.persisted.environments.length + 1}`,
              variables: [createKeyValue({ key: "baseUrl", value: "http://localhost:3000" })],
            };
            const persisted = {
              ...context.persisted,
              environments: [...context.persisted.environments, env],
              activeEnvironmentId: env.id,
            };
            saveSharedWorkspace(context, persisted);
            return { persisted, mainView: "environments" as const };
          }),
        },
        UPDATE_ENVIRONMENT: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              environments: context.persisted.environments.map((env) =>
                env.id === event.id ? { ...env, ...event.patch } : env,
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        DELETE_ENVIRONMENT: {
          actions: assign(({ context, event }) => {
            const nextEnvironments = context.persisted.environments.filter(
              (env) => env.id !== event.id,
            );
            const persisted = {
              ...context.persisted,
              environments: nextEnvironments.length
                ? nextEnvironments
                : defaultPersistedState().environments,
              activeEnvironmentId:
                context.persisted.activeEnvironmentId === event.id
                  ? (nextEnvironments[0]?.id ?? null)
                  : context.persisted.activeEnvironmentId,
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        UPDATE_ENVIRONMENT_VARIABLE: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              environments: context.persisted.environments.map((env) =>
                env.id !== event.envId
                  ? env
                  : {
                      ...env,
                      variables: env.variables.map((variable) =>
                        variable.id === event.variableId
                          ? { ...variable, ...event.patch }
                          : variable,
                      ),
                    },
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        ADD_ENVIRONMENT_VARIABLE: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              environments: context.persisted.environments.map((env) =>
                env.id !== event.envId
                  ? env
                  : { ...env, variables: [...env.variables, createKeyValue()] },
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        REMOVE_ENVIRONMENT_VARIABLE: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              environments: context.persisted.environments.map((env) =>
                env.id !== event.envId
                  ? env
                  : {
                      ...env,
                      variables: env.variables.filter(
                        (variable) => variable.id !== event.variableId,
                      ),
                    },
              ),
            };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        LOAD_HISTORY_ENTRY: {
          actions: raise(({ event }) => ({
            type: "OPEN_REQUEST_TAB" as const,
            request: structuredClone(event.entry.request),
          })),
        },
        CLEAR_HISTORY: {
          actions: assign(({ context }) => {
            const persisted = { ...context.persisted, history: [] };
            saveSharedWorkspace(context, persisted);
            return { persisted };
          }),
        },
        SET_THEME: {
          actions: assign(({ event }) => {
            saveThemeMode(event.theme);
            return { theme: event.theme };
          }),
        },
        HYDRATE_APP: {
          actions: assign(({ event }) => {
            const windowId = event.windowId;
            const session = event.persisted.windowSessions[windowId];
            const pending = event.pendingInit;

            let tabs: RequestTabState[];
            let activeTabId: string;
            let mainView: MainView;

            if (pending?.initialRequest) {
              const tab = createTabState(structuredClone(pending.initialRequest));
              tabs = [tab];
              activeTabId = tab.id;
              mainView = pending.mainView ?? "request";
            } else if (session?.tabs.length) {
              tabs = session.tabs.map(normalizeTabState);
              activeTabId = session.activeTabId;
              mainView = session.mainView;
            } else {
              const initialTab = createTabState(event.persisted.lastRequest);
              tabs = [initialTab];
              activeTabId = initialTab.id;
              mainView = pending?.mainView ?? "overview";
            }

            return {
              windowId,
              persisted: event.persisted,
              tabs,
              activeTabId,
              mainView,
              requestTab: session?.requestTab ?? "params",
              consoleOpen: session?.consoleOpen ?? false,
              responsePanelOpen: session?.responsePanelOpen ?? true,
              sidebarSearch: session?.sidebarSearch ?? "",
              overviewFilter: session?.sidebarSearch
                ? { ...defaultOverviewFilter(), query: session.sidebarSearch }
                : defaultOverviewFilter(),
              user: event.user,
            };
          }),
        },
        SYNC_WORKSPACE: {
          actions: assign(({ context, event }) => ({
            persisted: {
              ...event.persisted,
              windowSessions: {
                ...event.persisted.windowSessions,
                [context.windowId]: buildWindowSession({
                  tabs: context.tabs,
                  activeTabId: context.activeTabId,
                  mainView: context.mainView,
                  requestTab: context.requestTab,
                  consoleOpen: context.consoleOpen,
                  responsePanelOpen: context.responsePanelOpen,
                  sidebarSearch: context.sidebarSearch,
                }),
              },
            },
          })),
        },
        RESET_WORKSPACE: {
          actions: [
            assign(() => {
              const persisted = defaultPersistedState();
              const initialTab = createTabState(persisted.lastRequest);
              return {
                persisted,
                tabs: [initialTab],
                activeTabId: initialTab.id,
                mainView: "overview" as MainView,
                requestTab: "params" as RequestTab,
                consoleOpen: false,
                responsePanelOpen: true,
                sidebarSearch: "",
                overviewFilter: defaultOverviewFilter(),
                user: null,
              };
            }),
            () => {
              void clearUserSession();
            },
          ],
        },
        PERSIST_WINDOW_SESSION: {
          actions: ({ context }) => {
            persistLastRequest(context, false);
          },
        },
        SET_OVERVIEW_FILTER: {
          actions: assign({
            overviewFilter: ({ context, event }) => ({
              ...context.overviewFilter,
              ...event.patch,
            }),
          }),
        },
        RESET_OVERVIEW_FILTER: {
          actions: assign({ overviewFilter: defaultOverviewFilter }),
        },
        SIGN_IN: {
          actions: [
            assign(({ event }) => ({ user: event.user })),
            ({ event }) => {
              void saveUserSession(event.user);
              toast.success(`Welcome, ${event.user.name}`);
            },
          ],
        },
        SIGN_OUT: {
          actions: [
            assign({ user: null }),
            () => {
              void clearUserSession();
              toast.info("Signed out");
            },
          ],
        },
        SET_TEST_RESULTS: {
          actions: assign(({ context, event }) => ({
            tabs: mapActiveTab(context, (tab) => ({
              ...tab,
              testResults: event.results,
            })),
          })),
        },
        WS_CONNECT: {
          actions: "startActiveTabWebSocket",
        },
        WS_CONNECT_STARTED: {
          actions: assign(({ context, event }) => ({
            tabs: mapTabById(context, event.tabId, (tab) => ({
              ...tab,
              ws: {
                ...defaultWebSocketSession(),
                status: "connecting",
              },
            })),
          })),
        },
        WS_CONNECT_COMPLETE: {
          actions: [
            assign(({ context, event }) => ({
              tabs: mapTabById(context, event.tabId, (tab) => ({
                ...tab,
                ws: {
                  ...tab.ws,
                  connectionId: event.connectionId,
                  status: "open",
                  handshakeStatus: event.status,
                  handshakeHeaders: event.headers,
                  error: null,
                },
              })),
            })),
            ({ event }) => {
              toast.success("WebSocket connected", `Handshake ${event.status}`);
            },
          ],
        },
        WS_CONNECT_FAILED: {
          actions: [
            assign(({ context, event }) => ({
              tabs: mapTabById(context, event.tabId, (tab) => ({
                ...tab,
                ws: {
                  ...defaultWebSocketSession(),
                  status: "error",
                  error: event.error,
                },
              })),
            })),
            ({ event }) => {
              toast.error("WebSocket connection failed", event.error);
            },
          ],
        },
        WS_DISCONNECT: {
          actions: [
            ({ context, event }) => {
              const tabId = event.tabId ?? context.activeTabId;
              const tab = context.tabs.find((item) => item.id === tabId);
              if (tab) disconnectTabWebSocket(tab);
            },
            assign(({ context, event }) => {
              const tabId = event.tabId ?? context.activeTabId;
              return {
                tabs: mapTabById(context, tabId, (tab) => ({
                  ...tab,
                  ws: {
                    ...tab.ws,
                    connectionId: null,
                    status: "closed",
                  },
                })),
              };
            }),
            () => {
              toast.info("WebSocket disconnected");
            },
          ],
        },
        WS_SEND: {
          actions: assign(({ context, event }) => {
            const tab = getActiveTab(context);
            if (!tab?.ws.connectionId || tab.ws.status !== "open") return {};
            void wsSend(tab.ws.connectionId, event.data);
            return {
              tabs: mapActiveTab(context, (current) =>
                appendWsMessage(current, {
                  id: createId("ws"),
                  direction: "outgoing",
                  data: event.data,
                  binary: false,
                  timestamp: Date.now(),
                }),
              ),
            };
          }),
        },
        WS_MESSAGE_RECEIVED: {
          actions: assign(({ context, event }) => ({
            tabs: context.tabs.map((tab) => {
              if (tab.id !== event.tabId || tab.ws.connectionId !== event.connectionId) {
                return tab;
              }
              return appendWsMessage(tab, {
                id: createId("ws"),
                direction: "incoming",
                data: event.data,
                binary: event.binary,
                timestamp: event.timestamp,
              });
            }),
          })),
        },
        WS_CLOSED: {
          actions: assign(({ context, event }) => ({
            tabs: context.tabs.map((tab) => {
              if (tab.id !== event.tabId || tab.ws.connectionId !== event.connectionId) {
                return tab;
              }
              return {
                ...tab,
                ws: {
                  ...tab.ws,
                  connectionId: null,
                  status: "closed",
                  closeCode: event.code,
                  closeReason: event.reason,
                },
              };
            }),
          })),
        },
        WS_ERROR: {
          actions: [
            assign(({ context, event }) => ({
              tabs: context.tabs.map((tab) => {
                if (tab.id !== event.tabId || tab.ws.connectionId !== event.connectionId) {
                  return tab;
                }
                return {
                  ...tab,
                  ws: {
                    ...tab.ws,
                    connectionId: null,
                    status: "error",
                    error: event.message,
                  },
                };
              }),
            })),
            ({ event }) => {
              toast.error("WebSocket error", event.message);
            },
          ],
        },
        SEND: {
          actions: "startActiveTabRequest",
        },
        SEND_STARTED: {
          actions: assign(({ context, event }) => ({
            tabs: mapTabById(context, event.tabId, (tab) => ({
              ...tab,
              loading: true,
              error: null,
              testResults: null,
              inFlightRequestId: event.requestId,
            })),
          })),
        },
        SEND_COMPLETE: {
          actions: [
            assign(({ context, event }) => {
              const tab = context.tabs.find((item) => item.id === event.tabId);
              if (!tab || tab.inFlightRequestId !== event.requestId) {
                return {};
              }

              const persisted = {
                ...context.persisted,
                history: [event.historyEntry, ...context.persisted.history].slice(0, 50),
              };
              saveSharedWorkspace(context, persisted);

              return {
                tabs: mapTabById(context, event.tabId, (current) => ({
                  ...current,
                  loading: false,
                  inFlightRequestId: null,
                  response: event.response,
                  error: null,
                  testResults: event.testResults,
                })),
                persisted,
              };
            }),
            ({ event }) => {
              const { response } = event;
              const cacheLabel = response.fromCache ? " · cached" : "";
              toast.success(
                `${response.status} ${response.statusText}`,
                `${response.elapsedMs} ms${cacheLabel}`,
              );
            },
          ],
        },
        SEND_FAILED: {
          actions: [
            assign(({ context, event }) => {
              const tab = context.tabs.find((item) => item.id === event.tabId);
              if (!tab || tab.inFlightRequestId !== event.requestId) {
                return {};
              }

              return {
                tabs: mapTabById(context, event.tabId, (current) => ({
                  ...current,
                  loading: false,
                  inFlightRequestId: null,
                  response: null,
                  error: event.error,
                  testResults: null,
                })),
              };
            }),
            ({ event }) => {
              toast.error("Request failed", event.error);
            },
          ],
        },
        CANCEL_SEND: {
          actions: [
            ({ context, event }) => {
              const tabId = event.tabId ?? context.activeTabId;
              const tab = context.tabs.find((item) => item.id === tabId);
              if (tab?.inFlightRequestId) {
                void cancelHttpRequest(tab.inFlightRequestId);
                toast.info("Request cancelled");
              }
            },
          ],
        },
      },
    },
  },
});

export function selectActiveTab(context: AppMachineContext): RequestTabState | undefined {
  return getActiveTab(context);
}

export function selectActiveEnvironment(context: AppMachineContext): Environment | null {
  return getActiveEnvironment(context);
}
