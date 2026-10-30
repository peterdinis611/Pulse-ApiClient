import { describe, expect, it } from "vitest";
import { isOpenApiSpec } from "@/lib/openapi-import";

const sampleSpec = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Demo" },
  paths: {
    "/users": {
      get: { summary: "List users", responses: { "200": { description: "OK" } } },
    },
  },
});

describe("openapi-import", () => {
  it("detects OpenAPI specs", () => {
    expect(isOpenApiSpec(sampleSpec)).toBe(true);
    expect(isOpenApiSpec('{"info":{}}')).toBe(false);
    expect(isOpenApiSpec("not-json")).toBe(false);
  });
});
