import type { Environment } from "../types";

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function substituteVariables(input: string, environment: Environment | null): string {
  if (!input.includes("{{")) return input;

  return input.replace(VARIABLE_PATTERN, (_, name: string) => {
    const variable = environment?.variables.find(
      (item) => item.enabled && item.key.trim() === name,
    );
    return variable?.value ?? `{{${name}}}`;
  });
}

export function unresolvedVariables(input: string): string[] {
  const matches = [...input.matchAll(VARIABLE_PATTERN)];
  return matches.map((match) => match[1]);
}
