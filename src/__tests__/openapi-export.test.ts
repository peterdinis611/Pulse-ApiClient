import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("openapi-export", () => {
  it("requires desktop IPC outside Tauri", async () => {
    const { exportOpenApiCollection } = await import("@/lib/openapi-export");
    await expect(
      exportOpenApiCollection({ id: "c", name: "Demo", source: "pulse", folders: [] }, []),
    ).rejects.toThrow(/desktop/i);
  });
});
