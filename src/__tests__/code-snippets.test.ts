import { describe, expect, it, vi } from "vitest";
import { requestToSnippetAsync } from "@/lib/code-snippets";
import { createRequest, defaultAuth } from "@/lib/helpers";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

const request = createRequest({
  method: "POST",
  url: "https://api.example.com/users",
  bodyKind: "json",
  body: '{"name":"Ada"}',
  auth: { ...defaultAuth(), authType: "bearer", bearerToken: "secret" },
});

describe("code-snippets", () => {
  it("still emits Go locally without Tauri", async () => {
    const go = await requestToSnippetAsync("go", request);
    expect(go).toContain("http.NewRequest");
    expect(go).toContain("Bearer secret");
  });

  it("requires desktop IPC for other formats", async () => {
    await expect(requestToSnippetAsync("fetch", request)).rejects.toThrow(/desktop/i);
  });
});
