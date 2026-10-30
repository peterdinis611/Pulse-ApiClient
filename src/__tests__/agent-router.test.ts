import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("agent-router", () => {
  it("requires desktop IPC outside Tauri", async () => {
    const { routeAgentInputAsync } = await import("@/lib/agent-router");
    await expect(routeAgentInputAsync("help")).rejects.toThrow(/desktop/i);
  });

  it("maps expanded intents to capability keys", async () => {
    const { capabilityForIntent } = await import("@/lib/agent-settings");
    expect(capabilityForIntent("openapi_import")).toBe("openapi");
    expect(capabilityForIntent("openapi_list")).toBe("openapi");
    expect(capabilityForIntent("response_diff")).toBe("diff");
    expect(capabilityForIntent("mock_start")).toBe("mock");
    expect(capabilityForIntent("env_show")).toBe("env_show");
    expect(capabilityForIntent("curl_export")).toBe("curl_export");
    expect(capabilityForIntent("contract_check")).toBe("contract_check");
    expect(capabilityForIntent("draft_tests")).toBe("draft_tests");
    expect(capabilityForIntent("draft_pre_request")).toBe("draft_pre_request");
  });

  it("includes new capabilities in help text when enabled", async () => {
    const { buildAgentHelpText } = await import("@/lib/agent-router");
    const { defaultAgentSettings } = await import("@/lib/agent-settings");
    const help = buildAgentHelpText(defaultAgentSettings());
    expect(help).toMatch(/OpenAPI/i);
    expect(help).toMatch(/Mock/i);
    expect(help).toMatch(/export curl/i);
    expect(help).toMatch(/check contract/i);
  });
});
