import { describe, expect, it } from "vitest";
import {
  exportEnvironmentsDotenv,
  exportPostmanEnvironment,
  importDotenvAsEnvironment,
  isDotenvText,
} from "@/lib/env-io";
import { createEnvironment, createKeyValue } from "@/lib/helpers";
import { importEnvironmentsJson } from "@/lib/storage";
import { defaultPersistedState } from "@/lib/storage";

describe("env-io", () => {
  it("round-trips dotenv and detects format", () => {
    const env = createEnvironment("Staging");
    env.variables = [
      createKeyValue({ key: "baseUrl", value: "https://api.test" }),
      createKeyValue({ key: "token", value: "a b", secret: true }),
    ];
    const dotenv = exportEnvironmentsDotenv(env);
    expect(isDotenvText(dotenv)).toBe(true);
    expect(dotenv).toContain('token="a b"');

    const imported = importDotenvAsEnvironment(dotenv, "From file");
    expect(imported.variables.find((item) => item.key === "baseUrl")?.value).toBe(
      "https://api.test",
    );
  });

  it("exports Postman environment shape", () => {
    const env = createEnvironment("Local");
    env.variables = [createKeyValue({ key: "x", value: "1" })];
    const raw = exportPostmanEnvironment(env);
    const parsed = JSON.parse(raw) as { name: string; values: Array<{ key: string }> };
    expect(parsed.name).toBe("Local");
    expect(parsed.values[0]?.key).toBe("x");
  });

  it("imports dotenv through importEnvironmentsJson", () => {
    const state = defaultPersistedState();
    const next = importEnvironmentsJson("BASE=https://x.test\nTOKEN=abc\n", state);
    expect(next.environments[0]?.variables.some((item) => item.key === "BASE")).toBe(true);
  });
});
