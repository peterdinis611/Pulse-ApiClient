import { createEnvironment, createId } from "./helpers";
import type { Environment, KeyValue } from "@/types";

export function exportEnvironmentsDotenv(environment: Environment): string {
  const lines = [`# ${environment.name}`, ""];
  for (const item of environment.variables) {
    if (!item.key.trim() || item.enabled === false) continue;
    const key = item.key.trim();
    const value = item.value;
    const needsQuote = /[\s#"']/.test(value) || value === "";
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(needsQuote ? `${key}="${escaped}"` : `${key}=${value}`);
  }
  return `${lines.join("\n")}\n`;
}

export function exportPostmanEnvironment(environment: Environment): string {
  return JSON.stringify(
    {
      id: environment.id,
      name: environment.name,
      values: environment.variables
        .filter((item) => item.key.trim())
        .map((item) => ({
          key: item.key,
          value: item.value,
          enabled: item.enabled !== false,
          type: item.secret ? "secret" : "default",
        })),
      _postman_variable_scope: "environment",
    },
    null,
    2,
  );
}

export function isDotenvText(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  return trimmed.split(/\r?\n/).some((line) => {
    const value = line.trim();
    if (!value || value.startsWith("#")) return false;
    return /^export\s+[A-Za-z_][\w]*=/.test(value) || /^[A-Za-z_][\w]*=/.test(value);
  });
}

export function parseDotenv(raw: string): KeyValue[] {
  const rows: KeyValue[] = [];
  for (const line of raw.split(/\r?\n/)) {
    let text = line.trim();
    if (!text || text.startsWith("#") || !text.includes("=")) continue;
    if (text.startsWith("export ")) text = text.slice(7).trim();
    const eq = text.indexOf("=");
    const key = text.slice(0, eq).trim();
    let value = text.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    rows.push({
      id: createId("var"),
      key,
      value,
      enabled: true,
      initialValue: value,
    });
  }
  return rows;
}

export function importDotenvAsEnvironment(
  raw: string,
  name = "Imported .env",
): Environment {
  const env = createEnvironment(name);
  env.variables = parseDotenv(raw);
  return env;
}
