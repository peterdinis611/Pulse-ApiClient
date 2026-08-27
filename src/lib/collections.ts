import { createId } from "./helpers";
import type { CollectionGroup, SavedRequest } from "@/types";

export type FolderTreeNode = {
  name: string;
  path: string;
  requests: SavedRequest[];
  children: FolderTreeNode[];
};

export function createCollectionGroup(name: string, source: CollectionGroup["source"] = "pulse"): CollectionGroup {
  return {
    id: createId("col"),
    name,
    source,
    folders: [],
  };
}

export function defaultCollectionGroup(): CollectionGroup {
  return createCollectionGroup("My Collection");
}

export function requestsForCollection(requests: SavedRequest[], collectionId: string): SavedRequest[] {
  return requests.filter((item) => item.collectionId === collectionId);
}

export function requestsForFolder(
  requests: SavedRequest[],
  collectionId: string,
  folderPath: string,
): SavedRequest[] {
  const path = folderPath.trim();
  if (!path) return requestsForCollection(requests, collectionId).filter((item) => !item.folder);
  return requests.filter((item) => {
    if (item.collectionId !== collectionId) return false;
    const folder = item.folder?.trim() ?? "";
    return folder === path || folder.startsWith(`${path}/`);
  });
}

export function countFolderRequests(folder: FolderTreeNode): number {
  return folder.requests.length + folder.children.reduce((sum, child) => sum + countFolderRequests(child), 0);
}

export function groupRequestsByFolder(
  items: SavedRequest[],
  folderPaths: string[] = [],
): { root: SavedRequest[]; folders: FolderTreeNode[] } {
  const root: SavedRequest[] = [];
  const nodeMap = new Map<string, FolderTreeNode>();

  const ensureNode = (path: string): FolderTreeNode => {
    const existing = nodeMap.get(path);
    if (existing) return existing;

    const parts = path.split("/");
    const name = parts[parts.length - 1] ?? path;
    const node: FolderTreeNode = { name, path, requests: [], children: [] };
    nodeMap.set(path, node);

    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureNode(parentPath);
      if (!parent.children.some((child) => child.path === path)) {
        parent.children.push(node);
      }
    }

    return node;
  };

  for (const item of items) {
    const folder = item.folder?.trim();
    if (!folder) {
      root.push(item);
      continue;
    }

    ensureNode(folder).requests.push(item);
  }

  for (const folderPath of folderPaths) {
    const normalized = folderPath.trim().replace(/^\/+|\/+$/g, "");
    if (normalized) ensureNode(normalized);
  }

  const orderIndex = new Map(folderPaths.map((path, index) => [path, index]));
  const byFolderOrder = (a: FolderTreeNode, b: FolderTreeNode) => {
    const ai = orderIndex.get(a.path) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.path) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  };

  const topLevel = [...nodeMap.values()].filter((node) => !node.path.includes("/"));
  topLevel.sort(byFolderOrder);
  for (const node of nodeMap.values()) {
    node.children.sort(byFolderOrder);
  }

  return { root, folders: topLevel };
}

export function addFolderToCollection(collection: CollectionGroup, folderPath: string): CollectionGroup {
  const normalized = folderPath.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) return collection;

  const folders = [...collection.folders];
  const parts = normalized.split("/");
  for (let index = 1; index <= parts.length; index += 1) {
    const path = parts.slice(0, index).join("/");
    if (!folders.includes(path)) folders.push(path);
  }

  return { ...collection, folders };
}

export function removeFolderFromCollection(collection: CollectionGroup, folderPath: string): CollectionGroup {
  const folders = collection.folders.filter(
    (folder) => folder !== folderPath && !folder.startsWith(`${folderPath}/`),
  );
  return { ...collection, folders };
}

export function getCollectionName(groups: CollectionGroup[], collectionId: string): string {
  return groups.find((group) => group.id === collectionId)?.name ?? "Collection";
}
