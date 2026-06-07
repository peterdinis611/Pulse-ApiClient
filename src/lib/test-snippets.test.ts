import { describe, expect, it } from "vitest";
import { normalizeTestsToPulse, pulseTestsTemplate, testSnippets } from "./test-snippets";

describe("test-snippets", () => {
  it("exposes pulse snippets and template", () => {
    expect(testSnippets.length).toBeGreaterThan(0);
    expect(testSnippets.every((snippet) => snippet.code.includes("pulse.test"))).toBe(true);
    expect(pulseTestsTemplate).toContain("Pulse Tests tab");
  });

  it("converts legacy pm scripts to pulse syntax", () => {
    const converted = normalizeTestsToPulse(`pm.test("Status", function () {
  pm.response.to.have.status(200);
});`);

    expect(converted).toContain("pulse.test");
    expect(converted).toContain("pulse.response");
    expect(converted).not.toContain("pm.");
  });
});
