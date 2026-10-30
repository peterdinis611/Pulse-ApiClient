import { invoke } from "@tauri-apps/api/core";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import type { HttpResponse, TestRunResult } from "@/types";

export type JsonSchema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
  const?: unknown;
  enum?: unknown[];
  minItems?: number;
  maxItems?: number;
};

function requireTauri(): void {
  if (!canUseTauriIpc()) {
    throw new Error("JSON Schema validation requires the desktop app");
  }
}

/** Validate via pulse-core (`validate_json_schema`). Desktop-only. */
export async function validateJsonSchemaAsync(
  instance: unknown,
  schema: JsonSchema,
): Promise<string[]> {
  requireTauri();
  return invoke<string[]>("validate_json_schema", { instance, schema });
}

export function parseJsonSchema(raw: string): JsonSchema | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as JsonSchema;
  } catch {
    return null;
  }
}

export function mergeTestResults(...parts: Array<TestRunResult | null | undefined>): TestRunResult | null {
  const results = parts.flatMap((part) => part?.results ?? []);
  if (results.length === 0) return parts.find((part) => part != null) ?? null;
  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  return { passed, failed, total: results.length, results };
}

export async function validateResponseAgainstSchema(
  response: Pick<HttpResponse, "status" | "body" | "bodyEncoding">,
  schemaRaw: string,
): Promise<TestRunResult | null> {
  const raw = schemaRaw.trim();
  if (!raw) return null;

  const results: TestRunResult["results"] = [];
  const okStatus = response.status >= 200 && response.status < 300;
  results.push({
    name: "Status is 2xx (schema)",
    passed: okStatus,
    message: okStatus ? `${response.status}` : `expected 2xx, got ${response.status}`,
  });

  if (response.bodyEncoding === "base64") {
    results.push({
      name: "Body matches JSON Schema",
      passed: false,
      message: "binary body cannot be validated against JSON Schema",
    });
    return mergeTestResults({ passed: 0, failed: 0, total: 0, results })!;
  }

  const schema = parseJsonSchema(raw);
  if (!schema) {
    results.push({
      name: "Body matches JSON Schema",
      passed: false,
      message: "responseSchema is not a JSON object",
    });
    return mergeTestResults({ passed: 0, failed: 0, total: 0, results })!;
  }

  let instance: unknown;
  try {
    instance = JSON.parse(response.body);
  } catch {
    results.push({
      name: "Body matches JSON Schema",
      passed: false,
      message: "response body is not JSON",
    });
    return mergeTestResults({ passed: 0, failed: 0, total: 0, results })!;
  }

  const errors = await validateJsonSchemaAsync(instance, schema);
  results.push({
    name: "Body matches JSON Schema",
    passed: errors.length === 0,
    message: errors.length === 0 ? "ok" : errors.join("; "),
  });
  return mergeTestResults({ passed: 0, failed: 0, total: 0, results })!;
}
