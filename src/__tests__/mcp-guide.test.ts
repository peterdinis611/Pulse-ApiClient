import { describe, expect, it } from "vitest";
import { MCP_GUIDE_INTRO, MCP_GUIDE_SECTIONS } from "@/lib/mcp-guide";

describe("mcp-guide", () => {
  it("ships bilingual sections with stable ids", () => {
    expect(MCP_GUIDE_INTRO.en.length).toBeGreaterThan(20);
    expect(MCP_GUIDE_INTRO.sk.length).toBeGreaterThan(20);
    const ids = MCP_GUIDE_SECTIONS.map((section) => section.id);
    expect(ids).toEqual(["setup", "talk", "tools", "resources", "safety", "cli"]);
    for (const section of MCP_GUIDE_SECTIONS) {
      expect(section.title.en.trim()).not.toBe("");
      expect(section.title.sk.trim()).not.toBe("");
      expect(section.body.en.trim()).not.toBe("");
      expect(section.body.sk.trim()).not.toBe("");
    }
  });

  it("includes a copyable mcp.json example on setup", () => {
    const setup = MCP_GUIDE_SECTIONS.find((section) => section.id === "setup");
    expect(setup?.code).toContain("pulse_mcp.py");
    expect(setup?.code).toContain("PULSE_WORKSPACE");
  });
});
