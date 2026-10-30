import { describe, expect, it, vi } from "vitest";
import { mergeTestResults } from "@/lib/json-schema";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("json schema", () => {
  it("merges schema and script results", () => {
    const merged = mergeTestResults(
      { passed: 1, failed: 0, total: 1, results: [{ name: "schema", passed: true }] },
      { passed: 0, failed: 1, total: 1, results: [{ name: "script", passed: false, message: "nope" }] },
    );
    expect(merged?.total).toBe(2);
    expect(merged?.failed).toBe(1);
  });

  it("requires desktop IPC for validation", async () => {
    const { validateJsonSchemaAsync, validateResponseAgainstSchema } = await import(
      "@/lib/json-schema"
    );
    await expect(validateJsonSchemaAsync({}, { type: "object" })).rejects.toThrow(/desktop/i);
    await expect(
      validateResponseAgainstSchema(
        { status: 200, body: "{}", bodyEncoding: "utf8" },
        '{"type":"object"}',
      ),
    ).rejects.toThrow(/desktop/i);
  });
});
