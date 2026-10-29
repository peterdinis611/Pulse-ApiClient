import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("line-diff", () => {
  it("requires desktop IPC outside Tauri", async () => {
    const { unifiedLineDiff, prettyMaybeJson } = await import("@/lib/line-diff");
    await expect(unifiedLineDiff("a", "b")).rejects.toThrow(/desktop/i);
    await expect(prettyMaybeJson("{}")).rejects.toThrow(/desktop/i);
  });
});
