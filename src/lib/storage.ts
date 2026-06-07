import { readStorageItem, writeStorageItem } from "./app-config";
import type { CollectionGroup, Environment, HistoryEntry, SavedRequest } from "../types";
import { createEnvironment, createRequest, createSavedRequest } from "./helpers";
import { defaultCollectionGroup } from "./collections";
import { importPostmanCollection, isPostmanCollection } from "./postman-import";

const STATE_SUFFIX = "v1";

export type PersistedState = {
  collectionGroups: CollectionGroup[];
  activeCollectionId: string | null;
  collections: SavedRequest[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  history: HistoryEntry[];
  lastRequest: ReturnType<typeof createRequest>;
};

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
  };
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
  }));

  return {
    collectionGroups,
    activeCollectionId,
    collections,
    environments: parsed.environments?.length ? parsed.environments : defaults.environments,
    activeEnvironmentId: parsed.activeEnvironmentId ?? defaults.activeEnvironmentId,
    history: parsed.history ?? defaults.history,
    lastRequest: parsed.lastRequest ?? defaults.lastRequest,
  };
}

export function loadPersistedState(): PersistedState {
  try {
    const raw = readStorageItem(STATE_SUFFIX);
    if (!raw) return defaultPersistedState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return migratePersistedState(parsed);
  } catch {
    return defaultPersistedState();
  }
}

export function savePersistedState(state: PersistedState): void {
  writeStorageItem(STATE_SUFFIX, JSON.stringify(state));
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

export function importCollectionJson(
  raw: string,
  state: PersistedState,
): Pick<PersistedState, "collectionGroups" | "collections" | "activeCollectionId"> {
  if (isPostmanCollection(raw)) {
    const imported = importPostmanCollection(raw);
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
