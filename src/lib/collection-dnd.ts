import type { CollectionGroup, SavedRequest } from "@/types";

export type ReorderPosition = "before" | "after";

export type CollectionDragPayload =
  | { kind: "request"; id: string; collectionId: string }
  | { kind: "folder"; path: string; collectionId: string };

export const COLLECTION_DND_MIME = "application/x-pulse-collection-dnd";

export function encodeCollectionDragPayload(payload: CollectionDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeCollectionDragPayload(raw: string | undefined | null): CollectionDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CollectionDragPayload;
    if (parsed.kind === "request" && parsed.id && parsed.collectionId) return parsed;
    if (parsed.kind === "folder" && parsed.path && parsed.collectionId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function folderParentPath(path: string): string | null {
  const normalized = path.trim().replace(/^\/+|\/+$/g, "");
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) return null;
  return normalized.slice(0, slash);
}

/** Sibling folder paths that share the same parent (or root). */
export function areSiblingFolders(a: string, b: string): boolean {
  return folderParentPath(a) === folderParentPath(b);
}

export function reorderFolders(
  folders: string[],
  draggedPath: string,
  targetPath: string,
  position: ReorderPosition,
): string[] {
  if (draggedPath === targetPath) return folders;
  if (!areSiblingFolders(draggedPath, targetPath)) return folders;

  const without = folders.filter((path) => path !== draggedPath);
  const targetIndex = without.indexOf(targetPath);
  if (targetIndex === -1) return folders;

  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  const next = [...without];
  next.splice(insertAt, 0, draggedPath);
  return next;
}

/**
 * Move a request (optional folder change) and place it before/after a target request.
 * When `targetId` is null, append within the destination folder scope.
 */
export function relocateSavedRequest(
  collections: SavedRequest[],
  draggedId: string,
  options: {
    collectionId: string;
    folder?: string;
    targetId?: string | null;
    position?: ReorderPosition;
  },
): SavedRequest[] {
  const dragged = collections.find((item) => item.id === draggedId);
  if (!dragged) return collections;

  const nextFolder = options.folder;
  const updated: SavedRequest = {
    ...dragged,
    collectionId: options.collectionId,
    folder: nextFolder,
  };

  const without = collections.filter((item) => item.id !== draggedId);

  if (!options.targetId) {
    // Append among items that share the same collection + folder
    const lastSameScope = [...without]
      .reverse()
      .find(
        (item) =>
          item.collectionId === options.collectionId &&
          (item.folder ?? undefined) === (nextFolder ?? undefined),
      );
    if (!lastSameScope) return [...without, updated];
    const index = without.findIndex((item) => item.id === lastSameScope.id);
    const next = [...without];
    next.splice(index + 1, 0, updated);
    return next;
  }

  const targetIndex = without.findIndex((item) => item.id === options.targetId);
  if (targetIndex === -1) return [...without, updated];

  const insertAt = (options.position ?? "before") === "before" ? targetIndex : targetIndex + 1;
  const next = [...without];
  next.splice(insertAt, 0, updated);
  return next;
}

export function applyFolderReorder(
  groups: CollectionGroup[],
  collectionId: string,
  draggedPath: string,
  targetPath: string,
  position: ReorderPosition,
): CollectionGroup[] {
  return groups.map((group) => {
    if (group.id !== collectionId) return group;
    return {
      ...group,
      folders: reorderFolders(group.folders, draggedPath, targetPath, position),
    };
  });
}
