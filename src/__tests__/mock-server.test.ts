import { describe, expect, it, vi } from "vitest";
import { LOCKED_MOCK_PORT, clampMockDelayMs, startMockServer } from "@/lib/mock-server";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("mock-server", () => {
  it("clamps delay and exposes locked port", () => {
    expect(LOCKED_MOCK_PORT).toBe(4010);
    expect(clampMockDelayMs(-1)).toBe(0);
    expect(clampMockDelayMs(120_000)).toBe(60_000);
  });

  it("requires desktop IPC for routes and start", async () => {
    const { mockRoutesFromCollections } = await import("@/lib/mock-server");
    await expect(mockRoutesFromCollections([])).rejects.toThrow(/desktop/i);
    await expect(startMockServer([])).rejects.toThrow(/desktop/i);
  });
});
