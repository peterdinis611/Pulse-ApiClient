import { describe, expect, it } from "vitest";
import { FEATURE_DOC_SECTIONS, featureDocsMarkdown } from "../feature-docs";

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
      ]),
    );
    expect(FEATURE_DOC_SECTIONS.every((section) => section.items.length > 0)).toBe(true);
  });

  it("renders markdown for the docs folder", () => {
    const md = featureDocsMarkdown();
    expect(md).toContain("# Pulse feature guide");
    expect(md).toContain("## Workspace");
    expect(md).toContain("### Authentication");
    expect(md).toContain("OAuth 2.0");
  });
});
