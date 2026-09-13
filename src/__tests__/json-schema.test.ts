import { describe, expect, it } from "vitest";
import {
  mergeTestResults,
  validateJsonSchema,
  validateResponseAgainstSchema,
} from "@/lib/json-schema";

describe("json schema", () => {
  it("validates required object properties", () => {
    const errors = validateJsonSchema(
      { id: 1 },
      { type: "object", required: ["id", "name"], properties: { id: { type: "integer" } } },
    );
    expect(errors.some((item) => item.includes("name"))).toBe(true);
  });

  it("asserts 2xx and body against a response schema", () => {
    const result = validateResponseAgainstSchema(
      { status: 200, body: '{"id":1}', bodyEncoding: "utf8" },
      JSON.stringify({ type: "object", required: ["id"], properties: { id: { type: "integer" } } }),
    );
    expect(result?.failed).toBe(0);
    expect(result?.total).toBe(2);
  });

  it("fails a 404 against the schema contract", () => {
    const result = validateResponseAgainstSchema(
      { status: 404, body: "{}", bodyEncoding: "utf8" },
      '{"type":"object"}',
    );
    expect(result?.results.some((item) => item.name.includes("2xx") && !item.passed)).toBe(true);
  });

  it("merges schema and script results", () => {
    const merged = mergeTestResults(
      { passed: 1, failed: 0, total: 1, results: [{ name: "schema", passed: true }] },
      { passed: 0, failed: 1, total: 1, results: [{ name: "script", passed: false, message: "nope" }] },
    );
    expect(merged?.total).toBe(2);
    expect(merged?.failed).toBe(1);
  });
});
