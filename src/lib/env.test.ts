import { describe, expect, it } from "vitest";
import { substituteVariables, unresolvedVariables } from "./env";
import { createEnvironment, createKeyValue } from "./helpers";

describe("env", () => {
  const environment = createEnvironment("Local");
  environment.variables = [
    createKeyValue({ key: "baseUrl", value: "https://api.example.com" }),
    createKeyValue({ key: "token", value: "secret", enabled: true }),
    createKeyValue({ key: "disabled", value: "ignored", enabled: false }),
  ];

  it("substitutes enabled environment variables", () => {
    expect(substituteVariables("{{baseUrl}}/users", environment)).toBe(
      "https://api.example.com/users",
    );
    expect(substituteVariables("Bearer {{token}}", environment)).toBe("Bearer secret");
  });

  it("leaves unknown variables untouched", () => {
    expect(substituteVariables("{{missing}}", environment)).toBe("{{missing}}");
  });

  it("returns input unchanged when no placeholders exist", () => {
    expect(substituteVariables("plain-value", environment)).toBe("plain-value");
  });

  it("lists unresolved variables", () => {
    expect(unresolvedVariables("{{baseUrl}} {{missing}}")).toEqual(["baseUrl", "missing"]);
  });
});
