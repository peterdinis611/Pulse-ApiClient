import { describe, expect, it } from "vitest";
import { importOpenApiCollection, isOpenApiSpec } from "@/lib/openapi-import";

const sampleSpec = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Petstore" },
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/pets": {
      get: { summary: "List pets" },
      post: {
        summary: "Create pet",
        requestBody: {
          content: {
            "application/json": {
              example: { name: "Fluffy" },
            },
          },
        },
      },
    },
  },
});

describe("openapi-import", () => {
  it("detects OpenAPI specs", () => {
    expect(isOpenApiSpec(sampleSpec)).toBe(true);
    expect(isOpenApiSpec('{"name":"not-openapi"}')).toBe(false);
  });

  it("imports operations into a collection", () => {
    const imported = importOpenApiCollection(sampleSpec);
    expect(imported.collection.name).toBe("Petstore");
    expect(imported.requests).toHaveLength(2);
    expect(imported.requests[0]?.request.url).toContain("https://api.example.com/pets");
  });
});
