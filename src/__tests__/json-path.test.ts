import { describe, expect, it } from "vitest";
import {
  buildJsonTree,
  jsonLeafString,
  parseJsonBody,
  variableNameFromJsonPath,
} from "@/lib/json-path";

describe("json-path", () => {
  it("parses JSON bodies and rejects invalid text", () => {
    expect(parseJsonBody('{"token":"abc"}')).toEqual({ token: "abc" });
    expect(parseJsonBody("not-json")).toBeUndefined();
  });

  it("names variables from the last non-index path segment", () => {
    expect(variableNameFromJsonPath(["data", "token"])).toBe("token");
    expect(variableNameFromJsonPath(["items", 0, "id"])).toBe("id");
    expect(variableNameFromJsonPath(["access token"])).toBe("access_token");
  });

  it("stringifies leaves for environment values", () => {
    expect(jsonLeafString("abc")).toBe("abc");
    expect(jsonLeafString(42)).toBe("42");
    expect(jsonLeafString({ nested: true })).toBe('{"nested":true}');
  });

  it("builds a clickable tree for objects and arrays", () => {
    const tree = buildJsonTree({ data: { token: "secret", items: [{ id: 1 }] } });
    expect(tree?.type).toBe("object");
    expect(tree?.children[0]?.key).toBe("data");
    const token = tree?.children[0]?.children.find((child) => child.key === "token");
    expect(token?.preview).toBe("secret");
    expect(variableNameFromJsonPath(token?.path ?? [])).toBe("token");
  });
});
