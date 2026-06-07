import { describe, expect, it } from "vitest";
import {
  bodyKindForMethod,
  createRequest,
  formatBytes,
  prettyJson,
} from "../helpers";

describe("helpers", () => {
  it.each([
    [512, "512 B"],
    [2048, "2.0 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
  ] as const)("formatBytes(%i) → %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([
    ['{"a":1}', '{\n  "a": 1\n}'],
    ["not-json", "not-json"],
  ] as const)("prettyJson(%j)", (input, expected) => {
    expect(prettyJson(input)).toBe(expected);
  });

  it.each([
    ["GET", "json", "none"],
    ["GET", "graphql", "graphql"],
    ["POST", "json", "json"],
    ["HEAD", "raw", "none"],
  ] as const)("bodyKindForMethod(%s, %s) → %s", (method, bodyKind, expected) => {
    expect(bodyKindForMethod(method, bodyKind)).toBe(expected);
  });

  it("creates requests with pulse test defaults", () => {
    const request = createRequest();
    expect(request.tests).toContain("pulse.test");
    expect(request.tests).toContain("pulse.response");
    expect(request.method).toBe("GET");
  });
});
