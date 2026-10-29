import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("agent-router", () => {
  it("requires desktop IPC outside Tauri", async () => {
    const { routeAgentInputAsync } = await import("@/lib/agent-router");
    await expect(routeAgentInputAsync("help")).rejects.toThrow(/desktop/i);
  });
});
