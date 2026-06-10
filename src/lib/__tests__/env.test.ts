import { describe, expect, it } from "vitest";
import { substituteVariables, unresolvedVariables } from "../env";
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
});
