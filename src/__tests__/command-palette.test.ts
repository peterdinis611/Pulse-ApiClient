import { describe, expect, it } from "vitest";
import { buildCommandPaletteItems, filterCommandPaletteItems } from "@/lib/command-palette";
import { createCollectionGroup } from "@/lib/collections";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("command palette", () => {
  const collection = createCollectionGroup("Pets");
  const saved = createSavedRequest(createRequest({ name: "List pets", url: "https://api.test/pets" }), {
    collectionId: collection.id,
    name: "List pets",
  });
  const items = buildCommandPaletteItems({
    collections: [saved],
    collectionGroups: [collection],
    environments: [],
  });

  it("includes views, settings, collections, and requests", () => {
    expect(items.some((item) => item.kind === "view" && item.view === "settings")).toBe(true);
    expect(items.some((item) => item.kind === "view" && item.view === "mcp")).toBe(true);
    expect(items.some((item) => item.kind === "settings" && item.settingsSection === "http")).toBe(
      true,
    );
    expect(items.some((item) => item.action === "whats-new")).toBe(true);
    expect(items.some((item) => item.action === "product-tour")).toBe(true);
    expect(items.some((item) => item.action === "onboarding")).toBe(true);
    expect(items.some((item) => item.kind === "collection" && item.collectionId === collection.id)).toBe(
      true,
    );
    expect(items.some((item) => item.kind === "request" && item.savedRequestId === saved.id)).toBe(
      true,
    );
  });

  it("finds first-run setup by query", () => {
    const ranked = filterCommandPaletteItems(items, "first-run");
    expect(ranked.some((item) => item.action === "onboarding")).toBe(true);
  });

  it("fuzzy-ranks requests when queried", () => {
    const ranked = filterCommandPaletteItems(items, "list pe");
    expect(ranked[0]?.kind).toBe("request");
    expect(ranked[0]?.title).toMatch(/list pets/i);
  });

  it("hides the request dump until you type", () => {
    const idle = filterCommandPaletteItems(items, "");
    expect(idle.every((item) => item.kind !== "request")).toBe(true);
  });
});
