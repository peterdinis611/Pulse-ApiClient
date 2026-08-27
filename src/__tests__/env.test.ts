import { describe, expect, it } from "vitest";
import {
  applyEnvironmentMutations,
  getActiveVariableQuery,
  insertVariableAtCursor,
  maskSecretValue,
  mergeVariableLayers,
  substituteVariables,
  unresolvedVariables,
  variableTemplate,
} from "@/lib/env";
import { createEnvironment, createKeyValue } from "@/lib/helpers";

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

  it("merges layers with later keys winning", () => {
    const merged = mergeVariableLayers([
      [createKeyValue({ key: "token", value: "global" })],
      [createKeyValue({ key: "token", value: "env" }), createKeyValue({ key: "page", value: "1" })],
    ]);
    expect(merged.variables.find((item) => item.key === "token")?.value).toBe("env");
    expect(merged.variables.find((item) => item.key === "page")?.value).toBe("1");
  });

  it("masks secret values", () => {
    expect(maskSecretValue("super-secret", true)).toBe("••••••••••••");
    expect(maskSecretValue("super-secret", false)).toBe("super-secret");
  });

  it("upserts environment variables from JSON clicks or scripts", () => {
    const next = applyEnvironmentMutations(environment, [
      { key: "token", value: "from-json" },
      { key: "userId", value: "42" },
    ]);
    expect(next.variables.find((item) => item.key === "token")?.value).toBe("from-json");
    expect(next.variables.find((item) => item.key === "userId")?.value).toBe("42");
    expect(next.id).not.toBe("merged");
    expect(environment.variables.find((item) => item.key === "token")?.value).toBe("secret");
  });

  it("skips blank keys, no-ops empty lists, and re-enables existing rows", () => {
    const same = applyEnvironmentMutations(environment, []);
    expect(same).toBe(environment);

    const skipped = applyEnvironmentMutations(environment, [{ key: "  ", value: "nope" }]);
    expect(skipped.variables).toHaveLength(environment.variables.length);

    const disabled = createEnvironment("Local");
    disabled.variables = [createKeyValue({ key: "token", value: "old", enabled: false })];
    const enabled = applyEnvironmentMutations(disabled, [{ key: "token", value: "new" }]);
    expect(enabled.variables[0]).toMatchObject({ key: "token", value: "new", enabled: true });
  });
});
