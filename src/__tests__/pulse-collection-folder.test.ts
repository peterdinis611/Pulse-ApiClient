import { describe, expect, it } from "vitest";
import {
  exportPulseCollection,
  importPulseCollection,
  importPulseCollectionsFromFolder,
  PULSE_COLLECTION_SCHEMA,
} from "@/lib/pulse-collection";
import { createCollectionGroup } from "@/lib/collections";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("pulse collection folder sync", () => {
  it("replaces a collection of the same name from a folder file", () => {
    const group = createCollectionGroup("Pets");
    const original = createSavedRequest(createRequest({ name: "Old", url: "https://old.test" }), {
      collectionId: group.id,
      name: "Old",
    });
    const nextFile = exportPulseCollection(group, [
      createSavedRequest(createRequest({ name: "New", url: "https://new.test/pets" }), {
        collectionId: group.id,
        name: "New",
      }),
    ]);
    expect(JSON.parse(nextFile).info.schema).toBe(PULSE_COLLECTION_SCHEMA);

    const imported = importPulseCollectionsFromFolder(
      [{ name: "pets.pulse.json", contents: nextFile }],
      { collectionGroups: [group], collections: [original], activeCollectionId: group.id },
    );
    expect(imported.collectionGroups).toHaveLength(1);
    expect(imported.collectionGroups[0]?.id).toBe(group.id);
    expect(imported.collections.map((item) => item.name)).toEqual(["New"]);
  });

  it("round-trips a pulse collection JSON", () => {
    const group = createCollectionGroup("Echo");
    const saved = createSavedRequest(createRequest({ name: "Ping" }), {
      collectionId: group.id,
      name: "Ping",
    });
    const raw = exportPulseCollection(group, [saved]);
    const parsed = importPulseCollection(raw);
    expect(parsed.collection.name).toBe("Echo");
    expect(parsed.requests[0]?.name).toBe("Ping");
  });
});
