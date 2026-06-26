import { groupRequestsByFolder } from "./collections";
import { createId, createRequest, createSavedRequest } from "./helpers";
import type { ApiRequest, CollectionGroup, SavedRequest } from "@/types";

export const PULSE_COLLECTION_SCHEMA = "https://schema.pulse.dev/collection/v1.json";

type PulseCollectionItem = {
  name: string;
  item?: PulseCollectionItem[];
  request?: ApiRequest;
};

type PulseCollection = {
  info: {
    name: string;
    schema: string;
  };
  folders: string[];
  item: PulseCollectionItem[];
};

export type PulseCollectionImportResult = {
  collection: CollectionGroup;
  requests: SavedRequest[];
};

function toPulseRequestItem(saved: SavedRequest): PulseCollectionItem {
  return {
    name: saved.name,
    request: structuredClone(saved.request),
  };
}

function folderToPulseItem(folder: ReturnType<typeof groupRequestsByFolder>["folders"][number]): PulseCollectionItem {
  return {
    name: folder.name,
    item: [
      ...folder.requests.map(toPulseRequestItem),
      ...folder.children.map(folderToPulseItem),
    ],
  };
}

export function exportPulseCollection(group: CollectionGroup, requests: SavedRequest[]): string {
  const grouped = groupRequestsByFolder(requests, group.folders);
  const collection: PulseCollection = {
    info: {
      name: group.name,
      schema: PULSE_COLLECTION_SCHEMA,
    },
    folders: [...group.folders],
    item: [
      ...grouped.root.map(toPulseRequestItem),
      ...grouped.folders.map(folderToPulseItem),
    ],
  };

  return JSON.stringify(collection, null, 2);
}

function collectFolders(folderPaths: Set<string>, path: string) {
  if (!path.trim()) return;
  folderPaths.add(path);
  const parts = path.split("/");
  if (parts.length > 1) {
    collectFolders(folderPaths, parts.slice(0, -1).join("/"));
  }
}

function walkPulseItems(
  items: PulseCollectionItem[] | undefined,
  collectionId: string,
  folderPath: string,
  requests: SavedRequest[],
  folderPaths: Set<string>,
) {
  for (const item of items ?? []) {
    if (item.item?.length) {
      const nextFolder = folderPath ? `${folderPath}/${item.name}` : item.name;
      collectFolders(folderPaths, nextFolder);
      walkPulseItems(item.item, collectionId, nextFolder, requests, folderPaths);
      continue;
    }

    if (!item.request) continue;

    if (folderPath) collectFolders(folderPaths, folderPath);

    requests.push(
      createSavedRequest(createRequest(item.request), {
        collectionId,
        folder: folderPath || undefined,
        name: item.name?.trim() || item.request.name,
      }),
    );
  }
}

export function isPulseCollection(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as PulseCollection;
    return Boolean(
      parsed.info?.schema === PULSE_COLLECTION_SCHEMA ||
        (parsed.info?.schema?.includes("pulse") &&
          parsed.info?.schema?.includes("collection") &&
          Array.isArray(parsed.item)),
    );
  } catch {
    return false;
  }
}

export function importPulseCollection(raw: string): PulseCollectionImportResult {
  const parsed = JSON.parse(raw) as PulseCollection;

  if (!parsed.item?.length) {
    throw new Error("Pulse collection has no requests.");
  }

  const collectionId = createId("col");
  const folderPaths = new Set<string>(parsed.folders ?? []);
  const requests: SavedRequest[] = [];

  walkPulseItems(parsed.item, collectionId, "", requests, folderPaths);

  if (!requests.length) {
    throw new Error("No valid requests found in Pulse collection.");
  }

  const collection: CollectionGroup = {
    id: collectionId,
    name: parsed.info?.name?.trim() || "Imported Collection",
    source: "pulse",
    folders: [...folderPaths].sort(),
  };

  return { collection, requests };
}
