import { describe, expect, it } from "vitest";
import {
  bodyKindForMethod,
  createRequest,
  formatBytes,
  prettyJson,
} from "./helpers";

describe("helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("pretty prints valid json", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("not-json")).toBe("not-json");
  });

  it("clears body for GET unless graphql is selected", () => {
    expect(bodyKindForMethod("GET", "json")).toBe("none");
    expect(bodyKindForMethod("GET", "graphql")).toBe("graphql");
    expect(bodyKindForMethod("POST", "json")).toBe("json");
  });

  it("creates requests with pulse test defaults", () => {
    const request = createRequest();
    expect(request.tests).toContain("pulse.test");
    expect(request.method).toBe("GET");
  });
});
