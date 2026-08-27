import { describe, expect, it } from "vitest";
import { snapshotResponseExample } from "@/lib/request-examples";
import type { HttpResponse } from "@/types";

const response: HttpResponse = {
  status: 200,
  statusText: "OK",
  headers: [{ key: "content-type", value: "application/json" }],
  body: '{"ok":true}',
  elapsedMs: 42,
  sizeBytes: 11,
};

describe("request-examples", () => {
  it("snapshots the response with a default name from status", () => {
    const example = snapshotResponseExample(response);
    expect(example.name).toBe("200 OK");
    expect(example.response.body).toBe('{"ok":true}');
    expect(example.response).not.toBe(response);
  });

  it("uses a custom name when provided", () => {
    expect(snapshotResponseExample(response, "Login success").name).toBe("Login success");
  });

  it("trims blank names back to the status fallback", () => {
    expect(snapshotResponseExample(response, "   ").name).toBe("200 OK");
  });

  it("clones the response so later edits do not mutate the example", () => {
    const source = structuredClone(response);
    const example = snapshotResponseExample(source);
    source.body = "changed";
    source.headers[0]!.value = "text/plain";
    expect(example.response.body).toBe('{"ok":true}');
    expect(example.response.headers[0]?.value).toBe("application/json");
    expect(example.id.startsWith("ex_")).toBe(true);
    expect(Number.isNaN(Date.parse(example.savedAt))).toBe(false);
  });

  it("uses the status code when status text is blank", () => {
    expect(snapshotResponseExample({ ...response, statusText: "" }).name).toBe("200");
  });
});
