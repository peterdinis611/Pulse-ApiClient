import { describe, expect, it } from "vitest";
import { draftPreRequestFromResponse, draftTestsFromResponse } from "@/lib/agent-draft";
import type { HttpResponse } from "@/types";

const response: HttpResponse = {
  status: 200,
  statusText: "OK",
  headers: [{ key: "content-type", value: "application/json" }],
  body: JSON.stringify({ access_token: "abc", user: { id: "u1" } }),
  elapsedMs: 12,
  sizeBytes: 40,
  contentType: "application/json",
};

describe("agent drafts", () => {
  it("drafts status and json property tests", () => {
    const code = draftTestsFromResponse(response);
    expect(code).toContain("have.status(200)");
    expect(code).toContain('have.property("access_token")');
  });

  it("drafts pre-request env setters from token-like fields", () => {
    const code = draftPreRequestFromResponse(response);
    expect(code).toContain('pulse.environment.set("lastStatus"');
    expect(code).toContain("access_token");
  });

});
