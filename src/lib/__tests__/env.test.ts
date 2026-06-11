import { describe, expect, it } from "vitest";
import {
  getActiveVariableQuery,
  insertVariableAtCursor,
  substituteVariables,
  unresolvedVariables,
  variableTemplate,
} from "../env";
import { createEnvironment, createKeyValue } from "../helpers";

const environment = createEnvironment("Local");
environment.variables = [
  createKeyValue({ key: "baseUrl", value: "https://api.example.com" }),
  createKeyValue({ key: "token", value: "secret", enabled: true }),
  createKeyValue({ key: "disabled", value: "ignored", enabled: false }),
];

describe("env", () => {
  it.each([
    ["{{baseUrl}}/users", "https://api.example.com/users"],
    ["Bearer {{token}}", "Bearer secret"],
    ["{{missing}}", "{{missing}}"],
    ["plain-value", "plain-value"],
  ] as const)("substituteVariables(%j)", (input, expected) => {
    expect(substituteVariables(input, environment)).toBe(expected);
  });

  it("ignores disabled variables", () => {
    expect(substituteVariables("{{disabled}}", environment)).toBe("{{disabled}}");
  });

  it("handles undefined input", () => {
    expect(substituteVariables(undefined, environment)).toBe("");
  });

  it("lists unresolved variables", () => {
    expect(unresolvedVariables("{{baseUrl}} {{missing}}")).toEqual(["baseUrl", "missing"]);
  });

  it("builds variable templates", () => {
    expect(variableTemplate("baseUrl")).toBe("{{baseUrl}}");
  });

  it("detects active variable query while typing", () => {
    expect(getActiveVariableQuery("{{base", 6)).toBe("base");
    expect(getActiveVariableQuery("{{baseUrl}}/x", 10)).toBeNull();
  });

  it("inserts variables at cursor", () => {
    expect(insertVariableAtCursor("{{ba", 4, "baseUrl")).toEqual({
      value: "{{baseUrl}}",
      cursor: 11,
    });
    expect(insertVariableAtCursor("https://", 8, "baseUrl")).toEqual({
      value: "https://{{baseUrl}}",
      cursor: 19,
    });
  });
});
