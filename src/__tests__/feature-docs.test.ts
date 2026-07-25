import { describe, expect, it } from "vitest";
import {
  FEATURE_DOC_GROUPS,
  FEATURE_DOC_SECTIONS,
  featureDocsMarkdown,
} from "@/lib/feature-docs";

describe("feature-docs", () => {
  it("covers the main product areas", () => {
    const ids = FEATURE_DOC_SECTIONS.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "requests",
        "auth",
        "pre-request",
        "tests",
        "collections",
        "environments",
        "cookies",
        "themes",
        "websocket",
        "console",
        "search",
        "data",
      ]),
    );
    expect(FEATURE_DOC_SECTIONS.every((section) => section.items.length > 0)).toBe(true);
  });

  it("uses unique section ids and assigns every section to a known group", () => {
    const ids = FEATURE_DOC_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const section of FEATURE_DOC_SECTIONS) {
      expect(FEATURE_DOC_GROUPS).toContain(section.group);
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.summary.trim().length).toBeGreaterThan(0);
      expect(section.items.every((item) => item.trim().length > 0)).toBe(true);
    }
  });

  it("keeps at least one section in each docs group", () => {
    for (const group of FEATURE_DOC_GROUPS) {
      expect(
        FEATURE_DOC_SECTIONS.some((section) => section.group === group),
        `missing sections for ${group}`,
      ).toBe(true);
    }
  });

  it("documents scripting and theme capabilities with useful detail", () => {
    const preRequest = FEATURE_DOC_SECTIONS.find((section) => section.id === "pre-request");
    const themes = FEATURE_DOC_SECTIONS.find((section) => section.id === "themes");
    const tests = FEATURE_DOC_SECTIONS.find((section) => section.id === "tests");

    expect(preRequest?.items.some((item) => item.includes("pulse.environment.set"))).toBe(true);
    expect(preRequest?.tips?.length).toBeGreaterThan(0);
    expect(themes?.items.some((item) => item.toLowerCase().includes("css"))).toBe(true);
    expect(tests?.items.some((item) => item.includes("pulse.test"))).toBe(true);
  });

  it("renders markdown for the docs folder", () => {
    const md = featureDocsMarkdown();
    expect(md).toContain("# Pulse feature guide");
    expect(md).toContain("## Workspace");
    expect(md).toContain("## Scripting");
    expect(md).toContain("## Appearance");
    expect(md).toContain("### Authentication");
    expect(md).toContain("OAuth 2.0");
    expect(md).toContain("### Themes & custom CSS");
    expect(md).toContain("In-app: open **Docs**");
  });

  it("includes every section title in generated markdown", () => {
    const md = featureDocsMarkdown();
    for (const section of FEATURE_DOC_SECTIONS) {
      expect(md).toContain(`### ${section.title}`);
    }
  });
});
