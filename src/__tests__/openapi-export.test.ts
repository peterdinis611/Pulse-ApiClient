import { describe, expect, it } from "vitest";
import { exportOpenApiCollection } from "@/lib/openapi-export";
import { createCollectionGroup } from "@/lib/collections";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("openapi export", () => {
  it("writes paths and attached response schemas", () => {
    const group = createCollectionGroup("Pets");
    const saved = createSavedRequest(
      createRequest({
        name: "List pets",
        method: "GET",
        url: "https://api.example.com/pets",
        responseSchema: JSON.stringify({ type: "array" }),
      }),
      { collectionId: group.id, name: "List pets" },
    );
    const spec = JSON.parse(exportOpenApiCollection(group, [saved]));
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("Pets");
    expect(spec.paths["/pets"].get.summary).toBe("List pets");
    expect(spec.paths["/pets"].get.responses["200"].content["application/json"].schema).toEqual({
      type: "array",
    });
  });
});
