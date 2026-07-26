import { describe, expect, it } from "vitest";
import {
  applyFolderReorder,
  areSiblingFolders,
  decodeCollectionDragPayload,
  encodeCollectionDragPayload,
  readCollectionDragPayload,
  relocateSavedRequest,
  reorderFolders,
  setActiveCollectionDrag,
} from "@/lib/collection-dnd";
import { createCollectionGroup } from "@/lib/collections";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("collection-dnd", () => {
  it("encodes and decodes drag payloads", () => {
    const payload = { kind: "request" as const, id: "req_1", collectionId: "col_1" };
    expect(decodeCollectionDragPayload(encodeCollectionDragPayload(payload))).toEqual(payload);
    expect(decodeCollectionDragPayload("nope")).toBeNull();
  });

  it("prefers in-memory active drag over dataTransfer", () => {
    const payload = { kind: "folder" as const, path: "Auth", collectionId: "col_1" };
    setActiveCollectionDrag(payload);
    expect(readCollectionDragPayload(null)).toEqual(payload);
    setActiveCollectionDrag(null);
    expect(readCollectionDragPayload(null)).toBeNull();
  });

  it("reorders sibling folders and ignores nested targets", () => {
    const folders = ["A", "B", "A/Nested", "C"];
    expect(reorderFolders(folders, "C", "A", "before")).toEqual(["C", "A", "B", "A/Nested"]);
    expect(areSiblingFolders("A", "A/Nested")).toBe(false);
    expect(reorderFolders(folders, "A", "A/Nested", "after")).toEqual(folders);
  });

  it("relocates a request into a folder before a target", () => {
    const a = createSavedRequest(createRequest({ name: "A" }), { name: "A", collectionId: "col" });
    const b = createSavedRequest(createRequest({ name: "B" }), {
      name: "B",
      collectionId: "col",
      folder: "Auth",
    });
    const c = createSavedRequest(createRequest({ name: "C" }), {
      name: "C",
      collectionId: "col",
      folder: "Auth",
    });

    const next = relocateSavedRequest([a, b, c], a.id, {
      collectionId: "col",
      folder: "Auth",
      targetId: c.id,
      position: "before",
    });

    expect(next.map((item) => item.name)).toEqual(["B", "A", "C"]);
    expect(next.find((item) => item.id === a.id)?.folder).toBe("Auth");
  });

  it("applies folder reorder on a collection group", () => {
    const group = { ...createCollectionGroup("API"), id: "col", folders: ["One", "Two", "Three"] };
    const next = applyFolderReorder([group], "col", "Three", "One", "before");
    expect(next[0]?.folders).toEqual(["Three", "One", "Two"]);
  });
});
