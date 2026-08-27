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
});
