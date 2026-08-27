import { describe, expect, it } from "vitest";
import {
  buildJsonTree,
  jsonLeafString,
  jsonPreview,
  parseJsonBody,
  variableNameFromJsonPath,
} from "@/lib/json-path";

describe("json-path", () => {
  it("parses JSON bodies and rejects invalid text", () => {
    expect(parseJsonBody('{"token":"abc"}')).toEqual({ token: "abc" });
    expect(parseJsonBody("  [1, 2]  ")).toEqual([1, 2]);
    expect(parseJsonBody("not-json")).toBeUndefined();
    expect(parseJsonBody("   ")).toBeUndefined();
  });

  it("names variables from the last non-index path segment", () => {
    expect(variableNameFromJsonPath(["data", "token"])).toBe("token");
    expect(variableNameFromJsonPath(["items", 0, "id"])).toBe("id");
    expect(variableNameFromJsonPath(["access token"])).toBe("access_token");
    expect(variableNameFromJsonPath([0, 1])).toBe("value");
    expect(variableNameFromJsonPath(["***"])).toBe("value");
    expect(variableNameFromJsonPath(["user.id"])).toBe("user.id");
  });

  it("stringifies leaves for environment values", () => {
    expect(jsonLeafString("abc")).toBe("abc");
    expect(jsonLeafString(42)).toBe("42");
    expect(jsonLeafString(true)).toBe("true");
    expect(jsonLeafString(null)).toBe("null");
    expect(jsonLeafString({ nested: true })).toBe('{"nested":true}');
  });

  it("truncates long previews", () => {
    expect(jsonPreview("short")).toBe("short");
    expect(jsonPreview("abcdefghij", 4)).toBe("abcd…");
  });

  it("builds a clickable tree for objects and arrays", () => {
    const tree = buildJsonTree({ data: { token: "secret", items: [{ id: 1 }] } });
    expect(tree?.type).toBe("object");
    expect(tree?.children[0]?.key).toBe("data");
    const token = tree?.children[0]?.children.find((child) => child.key === "token");
    expect(token?.preview).toBe("secret");
    expect(variableNameFromJsonPath(token?.path ?? [])).toBe("token");
  });

  it("builds trees for arrays, primitives, and empty containers", () => {
    const arrayTree = buildJsonTree([{ id: 1 }, { id: 2 }]);
    expect(arrayTree?.type).toBe("array");
    expect(arrayTree?.preview).toBe("Array(2)");
    expect(arrayTree?.children).toHaveLength(2);

    expect(buildJsonTree(null)?.type).toBe("null");
    expect(buildJsonTree(true)?.type).toBe("boolean");
    expect(buildJsonTree(7)?.preview).toBe("7");
    expect(buildJsonTree({})?.children).toEqual([]);
    expect(buildJsonTree([])?.preview).toBe("Array(0)");
    expect(buildJsonTree(undefined)).toBeNull();
  });
});
