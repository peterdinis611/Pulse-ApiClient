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
import {
  defaultPersistedState,
  importCollectionJson,
  importPostmanIntoState,
  loadPersistedState,
  savePersistedState,
  type PersistedState,
} from "@/lib/storage";
import { loadThemeMode, saveThemeMode, type ThemeMode } from "@/lib/theme";

export function createTabState(request = createRequest()): RequestTabState {
  return {
    id: createId("tab"),
    request,
    response: null,
    error: null,
    loading: false,
    inFlightRequestId: null,
  };
}

export type AppMachineContext = {
  persisted: PersistedState;
  tabs: RequestTabState[];
  activeTabId: string;
  requestTab: RequestTab;
  mainView: MainView;
  sidebarSearch: string;
  consoleOpen: boolean;
  responsePanelOpen: boolean;
  theme: ThemeMode;
};

type SendInput = {
  tabId: string;
  requestId: string;
  request: ApiRequest;
  environment: Environment | null;
};

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
    .then((response) => {
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
    }
  | { type: "SEND_FAILED"; tabId: string; requestId: string; error: string }
  | { type: "CANCEL_SEND"; tabId?: string }
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
  | { type: "SET_THEME"; theme: ThemeMode };

function createInitialContext(): AppMachineContext {
  const persisted = loadPersistedState();
  const initialTab = createTabState(persisted.lastRequest);
  return {
    persisted,
    tabs: [initialTab],
    activeTabId: initialTab.id,
    requestTab: "params",
    mainView: "overview",
    sidebarSearch: "",
    consoleOpen: false,
    responsePanelOpen: true,
    theme: loadThemeMode(),
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

function persistLastRequest(context: AppMachineContext) {
  const activeTab = getActiveTab(context);
  if (!activeTab) return;
  savePersistedState({
    ...context.persisted,
    lastRequest: activeTab.request,
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

      const requestId = createId("http");
      self.send({ type: "SEND_STARTED", tabId: tab.id, requestId });
      startTabRequest(self, {
        tabId: tab.id,
        requestId,
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
          actions: assign({ sidebarSearch: ({ event }) => event.value }),
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
                  request: { ...tab.request, ...event.patch },
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
          actions: assign(({ context, event }) => {
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
          actions: assign(({ context }) => {
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
            savePersistedState({ ...persisted, lastRequest: activeTab.request });
            return { persisted };
          }),
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
            return { persisted };
          }),
        },
        IMPORT_POSTMAN: {
          actions: assign(({ context, event }) => {
            const persisted = importPostmanIntoState(event.raw, context.persisted);
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
            return { persisted };
          }),
        },
        SET_ACTIVE_COLLECTION: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              activeCollectionId: event.id,
            };
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
            return { persisted };
          }),
        },
        SET_ACTIVE_ENVIRONMENT: {
          actions: assign(({ context, event }) => {
            const persisted = {
              ...context.persisted,
              activeEnvironmentId: event.id,
            };
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
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
            const activeTab = getActiveTab(context);
            savePersistedState({
              ...persisted,
              lastRequest: activeTab?.request ?? persisted.lastRequest,
            });
            return { persisted };
          }),
        },
        SET_THEME: {
          actions: assign(({ event }) => {
            saveThemeMode(event.theme);
            return { theme: event.theme };
          }),
        },
      },
      states: {
        idle: {
          on: {
            SEND: {
              target: "sending",
              actions: assign({
                tabs: ({ context }) =>
                  mapActiveTab(context, (tab) => ({ ...tab, error: null })),
              }),
            },
          },
        },
        sending: {
          invoke: {
            src: "sendHttpRequest",
            input: ({ context }) => {
              const activeTab = getActiveTab(context);
              return {
                request: activeTab?.request ?? createRequest(),
                environment: getActiveEnvironment(context),
              };
            },
            onDone: {
              target: "idle",
              actions: [
                assign({
                  tabs: ({ context, event }) =>
                    mapActiveTab(context, (tab) => ({
                      ...tab,
                      response: event.output.response,
                      error: null,
                    })),
                  persisted: ({ context, event }) => ({
                    ...context.persisted,
                    history: [event.output.historyEntry, ...context.persisted.history].slice(0, 50),
                  }),
                }),
                "persistLastRequest",
              ],
            },
            onError: {
              target: "idle",
              actions: assign({
                tabs: ({ context, event }) =>
                  mapActiveTab(context, (tab) => ({
                    ...tab,
                    response: null,
                    error:
                      event.error instanceof Error ? event.error.message : String(event.error),
                  })),
              }),
            },
          },
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
