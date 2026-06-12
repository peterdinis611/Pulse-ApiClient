import { describe, expect, it } from "vitest";
import {
  defaultRequestTests,
  pulseTestsTemplate,
  testSnippets,
} from "../default-tests";
import { normalizeTestsToPulse } from "../test-snippets";

describe("test-snippets", () => {
  it("exposes pulse snippets and template", () => {
    expect(testSnippets.length).toBeGreaterThanOrEqual(15);
    expect(testSnippets.every((snippet) => snippet.code.includes("pulse.test"))).toBe(true);
    expect(testSnippets.every((snippet) => snippet.group)).toBe(true);
    expect(pulseTestsTemplate).toContain("Pulse test script");
    expect(defaultRequestTests).toContain("pulse.test");
    expect(defaultRequestTests).not.toContain("pm.");
  });

  it.each([
    [
      `pm.test("Status", function () {
  pm.response.to.have.status(200);
});`,
      ["pulse.test", "pulse.response"],
      ["pm."],
    ],
    [
      `pm.expect(pm.response.json().id).to.eql(1);`,
      ["pulse.expect", "pulse.response"],
      ["pm."],
    ],
  ] as const)("normalizeTestsToPulse converts legacy pm syntax", (input, includes, excludes) => {
    const converted = normalizeTestsToPulse(input);
    for (const fragment of includes) {
      expect(converted).toContain(fragment);
    }
    for (const fragment of excludes) {
      expect(converted).not.toContain(fragment);
    }
  });
});
