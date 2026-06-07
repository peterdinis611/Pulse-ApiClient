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

export function groupRequestsByFolder(items: SavedRequest[]): { root: SavedRequest[]; folders: FolderTreeNode[] } {
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

  const topLevel = [...nodeMap.values()].filter((node) => !node.path.includes("/"));
  topLevel.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { root, folders: topLevel };
}

export function addFolderToCollection(collection: CollectionGroup, folderPath: string): CollectionGroup {
  const normalized = folderPath.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) return collection;

  const folders = new Set(collection.folders);
  folders.add(normalized);

  const parts = normalized.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    folders.add(parts.slice(0, index).join("/"));
  }

  return { ...collection, folders: [...folders].sort() };
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
