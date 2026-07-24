import { readStorageItem, storageKey } from "./app-config";
import { dbLoadWorkspace, dbSaveWorkspace } from "./db-client";
import { importHistoryEntries } from "./history-client";
import { emitHistoryUpdated } from "./history-sync";
import { canUseTauriIpc } from "./tauri-runtime";
import { getCurrentWindowLabel } from "./window-manager";
import type {
  CollectionGroup,
  Environment,
  HistoryEntry,
  MainView,
  RequestTab,
  RequestTabState,
  SavedRequest,
} from "../types";
import {
  createEnvironment,
  createId,
  createRequest,
  createSavedRequest,
  normalizeRequest,
} from "./helpers";
import { defaultCollectionGroup } from "./collections";
import { importPostmanCollection, isPostmanCollection } from "./postman-import";
import { importBrunoIntoState, isBrunoCollection } from "./bruno-import";
import { importInsomniaIntoState, isInsomniaExport } from "./insomnia-import";
import { exportPulseCollection, importPulseCollection, isPulseCollection } from "./pulse-collection";
import { isOpenApiSpec, importOpenApiIntoState } from "./openapi-import";
import { emitWorkspaceUpdated } from "./workspace-sync";

const STATE_SUFFIX = "v1";
const MAX_WINDOW_SESSIONS = 12;

export type WindowSessionState = {
  tabs: RequestTabState[];
  activeTabId: string;
  mainView: MainView;
  requestTab: RequestTab;
  consoleOpen: boolean;
  responsePanelOpen: boolean;
  sidebarSearch: string;
  updatedAt: number;
};

export type PersistedState = {
  collectionGroups: CollectionGroup[];
  activeCollectionId: string | null;
  collections: SavedRequest[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  history: HistoryEntry[];
  lastRequest: ReturnType<typeof createRequest>;
  windowSessions: Record<string, WindowSessionState>;
};

export function clearLegacyPersistedState(): void {
  localStorage.removeItem(storageKey(STATE_SUFFIX));
  localStorage.removeItem(`relay-api-client/${STATE_SUFFIX}`);
}

export function defaultPersistedState(): PersistedState {
  const env = createEnvironment("Local");
  const defaultCollection = defaultCollectionGroup();
  return {
    collectionGroups: [defaultCollection],
    activeCollectionId: defaultCollection.id,
    collections: [],
    environments: [env],
    activeEnvironmentId: env.id,
    history: [],
    lastRequest: createRequest(),
    windowSessions: {},
  };
}

function sanitizeTab(tab: RequestTabState): RequestTabState {
  return {
    ...tab,
    loading: false,
    inFlightRequestId: null,
  };
}

export function buildWindowSession(input: {
  tabs: RequestTabState[];
  activeTabId: string;
  mainView: MainView;
  requestTab: RequestTab;
  consoleOpen: boolean;
  responsePanelOpen: boolean;
  sidebarSearch: string;
}): WindowSessionState {
  return {
    tabs: input.tabs.map(sanitizeTab),
    activeTabId: input.activeTabId,
    mainView: input.mainView,
    requestTab: input.requestTab,
    consoleOpen: input.consoleOpen,
    responsePanelOpen: input.responsePanelOpen,
    sidebarSearch: input.sidebarSearch,
    updatedAt: Date.now(),
  };
}

function trimWindowSessions(
  sessions: Record<string, WindowSessionState>,
): Record<string, WindowSessionState> {
  const entries = Object.entries(sessions).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  return Object.fromEntries(entries.slice(0, MAX_WINDOW_SESSIONS));
}

function migratePersistedState(parsed: Partial<PersistedState>): PersistedState {
  const defaults = defaultPersistedState();
  const collectionGroups = (parsed.collectionGroups?.length ? parsed.collectionGroups : defaults.collectionGroups).map(
    (group) => ({
      ...group,
      source:
        (group.source as string) === "relay" || group.source === "pulse"
          ? ("pulse" as const)
          : group.source,
    }),
  );
  const activeCollectionId =
    parsed.activeCollectionId ??
    collectionGroups[0]?.id ??
    defaults.activeCollectionId;

  const collections = (parsed.collections ?? []).map((item) => ({
    ...item,
    collectionId: item.collectionId ?? activeCollectionId ?? defaults.activeCollectionId!,
    request: normalizeRequest(item.request),
  }));

  const windowSessions = Object.fromEntries(
    Object.entries(parsed.windowSessions ?? defaults.windowSessions).map(([key, session]) => [
      key,
      {
        ...session,
        tabs: session.tabs.map((tab) => ({
          ...tab,
          request: normalizeRequest(tab.request),
        })),
      },
    ]),
  );

  return {
    collectionGroups,
    activeCollectionId,
    collections,
    environments: parsed.environments?.length ? parsed.environments : defaults.environments,
    activeEnvironmentId: parsed.activeEnvironmentId ?? defaults.activeEnvironmentId,
    history: [],
    lastRequest: normalizeRequest(parsed.lastRequest),
    windowSessions,
  };
}

function loadLegacyPersistedState(): PersistedState {
  try {
    const raw = readStorageItem(STATE_SUFFIX);
    if (!raw) return defaultPersistedState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return migratePersistedState(parsed);
  } catch {
    return defaultPersistedState();
  }
}

export async function loadPersistedState(): Promise<PersistedState> {
  if (canUseTauriIpc()) {
    try {
      const raw = await dbLoadWorkspace();
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        const embeddedHistory = (parsed.history ?? []).map((entry) => ({
          ...entry,
          request: normalizeRequest(entry.request),
        }));
        const migrated = migratePersistedState(parsed);
        return migrateEmbeddedHistory(migrated, embeddedHistory);
      }
      return defaultPersistedState();
    } catch {
      return defaultPersistedState();
    }
  }

  return loadLegacyPersistedState();
}

async function migrateEmbeddedHistory(
  state: PersistedState,
  embeddedHistory: HistoryEntry[],
): Promise<PersistedState> {
  if (!canUseTauriIpc() || embeddedHistory.length === 0) {
    return state;
  }

  await importHistoryEntries(embeddedHistory);
  const windowId = await getCurrentWindowLabel().catch(() => undefined);
  await Promise.all([
    emitHistoryUpdated(windowId),
    dbSaveWorkspace(JSON.stringify(state)),
  ]);
  return state;
}

export async function savePersistedState(
  state: PersistedState,
  options?: { sourceWindowId?: string; broadcast?: boolean },
): Promise<void> {
  if (!canUseTauriIpc()) return;

  const nextState = {
    ...state,
    windowSessions: trimWindowSessions(state.windowSessions),
  };
  await dbSaveWorkspace(JSON.stringify(nextState));
  if (options?.broadcast !== false && options?.sourceWindowId) {
    await emitWorkspaceUpdated(options.sourceWindowId);
  }
}

export function exportCollectionJson(state: Pick<PersistedState, "collectionGroups" | "collections">): string {
  return JSON.stringify(
    {
      version: 2,
      collectionGroups: state.collectionGroups,
      collections: state.collections,
    },
    null,
    2,
  );
}

export function exportSingleCollectionJson(
  collectionId: string,
  state: Pick<PersistedState, "collectionGroups" | "collections">,
): string | null {
  const group = state.collectionGroups.find((item) => item.id === collectionId);
  if (!group) return null;

  const requests = state.collections.filter((item) => item.collectionId === collectionId);
  return exportPulseCollection(group, requests);
}

export function exportEnvironmentsJson(environments: Environment[]): string {
  return JSON.stringify({ version: 1, environments }, null, 2);
}

type PostmanEnvironment = {
  name?: string;
  values?: Array<{ key?: string; value?: string; enabled?: boolean }>;
};

export function importEnvironmentsJson(
  raw: string,
  state: PersistedState,
): Pick<PersistedState, "environments" | "activeEnvironmentId"> {
  const parsed = JSON.parse(raw) as
    | { version?: number; environments?: Environment[] }
    | PostmanEnvironment
    | PostmanEnvironment[];

  if (Array.isArray(parsed)) {
    const environments = parsed.map((item) => {
      const env = createEnvironment(item.name?.trim() || "Imported Environment");
      env.variables = (item.values ?? []).map((variable) => ({
        id: createId("var"),
        key: variable.key ?? "",
        value: variable.value ?? "",
        enabled: variable.enabled !== false,
      }));
      return env;
    });
    return {
      environments: [...environments, ...state.environments],
      activeEnvironmentId: environments[0]?.id ?? state.activeEnvironmentId,
    };
  }

  if ("values" in parsed && Array.isArray(parsed.values)) {
    const env = createEnvironment(parsed.name?.trim() || "Imported Environment");
    env.variables = parsed.values.map((variable) => ({
      id: createId("var"),
      key: variable.key ?? "",
      value: variable.value ?? "",
      enabled: variable.enabled !== false,
    }));
    return {
      environments: [env, ...state.environments],
      activeEnvironmentId: env.id,
    };
  }

  const pulseExport = parsed as { version?: number; environments?: Environment[] };
  const environments = (pulseExport.environments ?? []).map((item: Environment) => ({
    ...item,
    id: item.id || createId("env"),
    variables: item.variables.map((variable) => ({
      ...variable,
      id: variable.id || createId("var"),
    })),
  }));

  return {
    environments: [...environments, ...state.environments],
    activeEnvironmentId: environments[0]?.id ?? state.activeEnvironmentId,
  };
}

export function importCollectionJson(
  raw: string,
  state: PersistedState,
): Pick<PersistedState, "collectionGroups" | "collections" | "activeCollectionId"> {
  if (isOpenApiSpec(raw)) {
    return importOpenApiIntoState(raw, state);
  }

  if (isInsomniaExport(raw)) {
    return importInsomniaIntoState(raw, state);
  }

  if (isPostmanCollection(raw)) {
    const imported = importPostmanCollection(raw);
    return {
      collectionGroups: [...state.collectionGroups, imported.collection],
      collections: [...imported.requests, ...state.collections],
      activeCollectionId: imported.collection.id,
    };
  }

  if (isBrunoCollection(raw)) {
    return importBrunoIntoState(raw, state);
  }

  if (isPulseCollection(raw)) {
    const imported = importPulseCollection(raw);
    return {
      collectionGroups: [...state.collectionGroups, imported.collection],
      collections: [...imported.requests, ...state.collections],
      activeCollectionId: imported.collection.id,
    };
  }

  const parsed = JSON.parse(raw) as
    | { version?: number; collectionGroups?: CollectionGroup[]; collections?: SavedRequest[] }
    | SavedRequest[];

  if (Array.isArray(parsed)) {
    const activeCollectionId = state.activeCollectionId ?? state.collectionGroups[0]?.id;
    if (!activeCollectionId) {
      return {
        collectionGroups: state.collectionGroups,
        collections: state.collections,
        activeCollectionId: state.activeCollectionId,
      };
    }

    const collections = parsed.map((item) =>
      createSavedRequest(item.request, {
        collectionId: item.collectionId ?? activeCollectionId,
        folder: item.folder,
        name: item.name,
      }),
    );

    return {
      collectionGroups: state.collectionGroups,
      collections: [...collections, ...state.collections],
      activeCollectionId,
    };
  }

  const importedGroups = parsed.collectionGroups ?? [];
  const importedCollections = parsed.collections ?? [];
  const fallbackCollectionId = state.activeCollectionId ?? state.collectionGroups[0]?.id;

  return {
    collectionGroups: [...importedGroups, ...state.collectionGroups],
    collections: [
      ...importedCollections.map((item) =>
        createSavedRequest(item.request, {
          collectionId: item.collectionId ?? fallbackCollectionId ?? state.collectionGroups[0]!.id,
          folder: item.folder,
          name: item.name,
        }),
      ),
      ...state.collections,
    ],
    activeCollectionId: importedGroups[0]?.id ?? fallbackCollectionId ?? state.activeCollectionId,
  };
}

export function importPostmanIntoState(raw: string, state: PersistedState): PersistedState {
  const imported = importPostmanCollection(raw);
  return {
    ...state,
    collectionGroups: [...state.collectionGroups, imported.collection],
    collections: [...imported.requests, ...state.collections],
    activeCollectionId: imported.collection.id,
  };
}

export function importBrunoCollectionIntoState(raw: string, state: PersistedState): PersistedState {
  return {
    ...state,
    ...importBrunoIntoState(raw, state),
  };
}

export function importInsomniaCollectionIntoState(raw: string, state: PersistedState): PersistedState {
  return {
    ...state,
    ...importInsomniaIntoState(raw, state),
  };
}
