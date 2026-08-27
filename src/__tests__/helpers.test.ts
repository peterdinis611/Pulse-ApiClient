import { describe, expect, it } from "vitest";
import {
  bodyKindForMethod,
  createKeyValue,
  createRequest,
  ensureTrailingBlankKeyValue,
  formatBytes,
  isKeyValueBlank,
  prettyJson,
} from "@/lib/helpers";

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
    expect(request.auth.authType).toBe("inherit");
    expect(request.examples).toEqual([]);
  });

  it("clones saved examples onto a new request", () => {
    const example = {
      id: "ex_1",
      name: "200 OK",
      savedAt: "2026-01-01T00:00:00.000Z",
      response: {
        status: 200,
        statusText: "OK",
        headers: [],
        body: "{}",
        elapsedMs: 10,
        sizeBytes: 2,
      },
    };
    const request = createRequest({ examples: [example] });
    example.name = "mutated";
    expect(request.examples).toHaveLength(1);
    expect(request.examples[0]?.name).toBe("200 OK");
  });

  it("syncs path params from the URL", () => {
    const request = createRequest({ url: "https://api.example.com/users/:id" });
    expect(request.pathParams.map((item) => item.key)).toEqual(["id"]);
  });

  it("keeps a trailing blank key-value row", () => {
    expect(isKeyValueBlank(createKeyValue())).toBe(true);
    const filled = [createKeyValue({ key: "Accept", value: "application/json" })];
    const next = ensureTrailingBlankKeyValue(filled);
    expect(next).toHaveLength(2);
    expect(isKeyValueBlank(next[1]!)).toBe(true);
    expect(ensureTrailingBlankKeyValue(next)).toBe(next);
  });
});
