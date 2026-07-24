import type { Environment } from "../types";
import { createKeyValue } from "./helpers";

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const VARIABLE_AUTOCOMPLETE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]*)$/;

export function variableTemplate(key: string): string {
  return `{{${key}}}`;
}

export function getEnabledVariables(environment: Environment | null) {
  return (
    environment?.variables.filter((item) => item.enabled && item.key.trim()) ?? []
  );
}

export function containsVariables(input: string | undefined | null): boolean {
  return Boolean(input?.includes("{{"));
}

/** Partial variable name being typed before the cursor, e.g. `{{base` → `base`. */
export function getActiveVariableQuery(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const match = before.match(VARIABLE_AUTOCOMPLETE_PATTERN);
  return match ? match[1] : null;
}

export function insertVariableAtCursor(
  value: string,
  cursor: number,
  key: string,
): { value: string; cursor: number } {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const match = before.match(VARIABLE_AUTOCOMPLETE_PATTERN);

  if (match) {
    const start = before.length - match[0].length;
    const template = variableTemplate(key);
    const next = before.slice(0, start) + template + after;
    return { value: next, cursor: start + template.length };
  }

  const template = variableTemplate(key);
  const next = before + template + after;
  return { value: next, cursor: before.length + template.length };
}

export function substituteVariables(
  input: string | undefined | null,
  environment: Environment | null,
): string {
  if (input == null || input === "") return "";
  if (!input.includes("{{")) return input;

  return input.replace(VARIABLE_PATTERN, (_, name: string) => {
    const variable = environment?.variables.find(
      (item) => item.enabled && item.key.trim() === name,
    );
    return variable?.value ?? `{{${name}}}`;
  });
}

export function unresolvedVariables(input: string | undefined | null): string[] {
  if (!input) return [];
  const matches = [...input.matchAll(VARIABLE_PATTERN)];
  return matches.map((match) => match[1]);
}

export type EnvMutation = {
  key: string;
  value: string;
};

/** Upsert environment variables from pre-request `pulse.environment.set` mutations. */
export function applyEnvironmentMutations(
  environment: Environment,
  mutations: EnvMutation[],
): Environment {
  if (!mutations.length) return environment;

  const variables = [...environment.variables];
  for (const mutation of mutations) {
    const key = mutation.key.trim();
    if (!key) continue;
    const existing = variables.findIndex((item) => item.key.trim() === key);
    if (existing >= 0) {
      variables[existing] = {
        ...variables[existing]!,
        key,
        value: mutation.value,
        enabled: true,
      };
    } else {
      variables.push(createKeyValue({ key, value: mutation.value, enabled: true }));
    }
  }

  return { ...environment, variables };
}
