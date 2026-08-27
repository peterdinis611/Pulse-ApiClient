import { describe, expect, it } from "vitest";
import { addFolderToCollection, createCollectionGroup, groupRequestsByFolder, requestsForFolder } from "@/lib/collections";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("collections", () => {
  it("shows empty folders defined on the collection", () => {
    const collection = addFolderToCollection(createCollectionGroup("API"), "Auth/OAuth");
    const grouped = groupRequestsByFolder([], collection.folders);

    expect(grouped.folders).toHaveLength(1);
    expect(grouped.folders[0]?.path).toBe("Auth");
    expect(grouped.folders[0]?.children[0]?.path).toBe("Auth/OAuth");
    expect(grouped.folders[0]?.children[0]?.requests).toHaveLength(0);
  });

  it("groups saved requests under folder paths", () => {
    const request = createRequest();
    const saved = createSavedRequest(request, {
      name: "Token",
      folder: "Auth/OAuth",
    });

    const grouped = groupRequestsByFolder([saved], ["Auth/OAuth"]);

    expect(grouped.root).toHaveLength(0);
    expect(grouped.folders[0]?.children[0]?.requests).toHaveLength(1);
  });

  it("creates parent folders when adding nested paths", () => {
    const collection = addFolderToCollection(createCollectionGroup("API"), "Billing/Invoices");

    expect(collection.folders).toEqual(["Billing", "Billing/Invoices"]);
  });

  it("preserves folder declaration order instead of sorting alphabetically", () => {
    const grouped = groupRequestsByFolder([], ["Zebra", "Alpha", "Zebra/Nested"]);
    expect(grouped.folders.map((folder) => folder.path)).toEqual(["Zebra", "Alpha"]);
    expect(grouped.folders[0]?.children.map((child) => child.path)).toEqual(["Zebra/Nested"]);
  });

  it("lists requests in a folder and its nested children", () => {
    const collectionId = "col_1";
    const nested = createSavedRequest(createRequest(), {
      collectionId,
      folder: "Auth/OAuth",
      name: "Token",
    });
    const sibling = createSavedRequest(createRequest(), {
      collectionId,
      folder: "Auth",
      name: "Login",
    });
    const other = createSavedRequest(createRequest(), {
      collectionId,
      folder: "Billing",
      name: "Invoice",
    });
    const items = requestsForFolder([nested, sibling, other], collectionId, "Auth");
    expect(items.map((item) => item.name).sort()).toEqual(["Login", "Token"]);
  });
});
