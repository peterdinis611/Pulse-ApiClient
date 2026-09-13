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

export function validateJsonSchema(instance: unknown, schema: JsonSchema, path = "$"): string[] {
  const errors: string[] = [];
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = jsonTypeName(instance);
    const matches = expected.some((name) => {
      if (name === "number") return actual === "number" || actual === "integer";
      return name === actual;
    });
    if (!matches) {
      errors.push(`${path}: expected ${expected.join("|")}, got ${actual}`);
      return errors;
    }
  }

  if (instance && typeof instance === "object" && !Array.isArray(instance)) {
    const record = instance as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) errors.push(`${path}: missing required property '${key}'`);
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(properties)) {
      if (key in record) errors.push(...validateJsonSchema(record[key], child, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      const extras = Object.keys(record).filter((key) => !(key in properties));
      if (extras.length > 0) errors.push(`${path}: unexpected properties ${extras.join(", ")}`);
    }
  }

  if (Array.isArray(instance) && schema.items) {
    instance.forEach((item, index) => {
      errors.push(...validateJsonSchema(item, schema.items as JsonSchema, `${path}[${index}]`));
    });
    if (schema.minItems != null && instance.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} items`);
    }
    if (schema.maxItems != null && instance.length > schema.maxItems) {
      errors.push(`${path}: expected at most ${schema.maxItems} items`);
    }
  }

  if ("const" in schema && instance !== schema.const) {
    errors.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((value) => Object.is(value, instance))) {
    errors.push(`${path}: expected one of ${JSON.stringify(schema.enum)}`);
  }

  return errors;
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

function jsonTypeName(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

export function mergeTestResults(...parts: Array<TestRunResult | null | undefined>): TestRunResult | null {
  const results = parts.flatMap((part) => part?.results ?? []);
  if (results.length === 0) return parts.find((part) => part != null) ?? null;
  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  return { passed, failed, total: results.length, results };
}

export function validateResponseAgainstSchema(
  response: Pick<HttpResponse, "status" | "body" | "bodyEncoding">,
  schemaRaw: string,
): TestRunResult | null {
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

  const errors = validateJsonSchema(instance, schema);
  results.push({
    name: "Body matches JSON Schema",
    passed: errors.length === 0,
    message: errors.length === 0 ? "ok" : errors.join("; "),
  });
  return mergeTestResults({ passed: 0, failed: 0, total: 0, results })!;
}
