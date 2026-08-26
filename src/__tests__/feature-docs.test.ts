import { describe, expect, it } from "vitest";
import {
  FEATURE_DOC_GROUPS,
  FEATURE_DOC_SECTIONS,
  featureDocsMarkdown,
  featureDocsFumadocsFiles,
} from "@/lib/feature-docs";

describe("feature-docs", () => {
  it("covers the main product areas", () => {
    const ids = FEATURE_DOC_SECTIONS.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "overview",
        "requests",
        "path-params",
        "auth",
        "inherit",
        "code-snippets",
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
      expect((section.howTo ?? []).every((step) => step.trim().length > 0)).toBe(true);
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

  it("documents scripting, inheritance, and theme capabilities with useful detail", () => {
    const preRequest = FEATURE_DOC_SECTIONS.find((section) => section.id === "pre-request");
    const themes = FEATURE_DOC_SECTIONS.find((section) => section.id === "themes");
    const tests = FEATURE_DOC_SECTIONS.find((section) => section.id === "tests");
    const inherit = FEATURE_DOC_SECTIONS.find((section) => section.id === "inherit");
    const pathParams = FEATURE_DOC_SECTIONS.find((section) => section.id === "path-params");
    const snippets = FEATURE_DOC_SECTIONS.find((section) => section.id === "code-snippets");
    const environments = FEATURE_DOC_SECTIONS.find((section) => section.id === "environments");

    expect(preRequest?.items.some((item) => item.includes("pulse.environment.set"))).toBe(true);
    expect(preRequest?.tips?.length).toBeGreaterThan(0);
    expect(themes?.items.some((item) => item.toLowerCase().includes("css"))).toBe(true);
    expect(tests?.items.some((item) => item.includes("pulse.test"))).toBe(true);
    expect(inherit?.howTo?.length).toBeGreaterThan(0);
    expect(pathParams?.items.some((item) => item.includes(":id"))).toBe(true);
    expect(snippets?.items.some((item) => item.toLowerCase().includes("axios"))).toBe(true);
    expect(environments?.summary.toLowerCase()).toContain("globals");
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

  it("emits a Fumadocs page for every feature section", () => {
    const files = featureDocsFumadocsFiles();
    const paths = files.map((file) => file.path);
    expect(paths).toContain("index.mdx");
    expect(paths).toContain("meta.json");
    for (const section of FEATURE_DOC_SECTIONS) {
      expect(paths.some((path) => path.endsWith(`/${section.id}.mdx`))).toBe(true);
    }
  });

  it("includes every section title in generated markdown", () => {
    const md = featureDocsMarkdown();
    for (const section of FEATURE_DOC_SECTIONS) {
      expect(md).toContain(`### ${section.title}`);
    }
  });

  it("includes How to steps in generated markdown", () => {
    const md = featureDocsMarkdown();
    expect(md).toContain("**How to**");
    expect(md).toContain("### Path parameters");
    expect(md).toContain("### Collection & folder inheritance");
    expect(md).toContain("### Code snippets");
    expect(md).toContain("### Overview");
  });

  it("keeps docs/FEATURES.md in sync with featureDocsMarkdown()", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const onDisk = readFileSync(resolve(root, "docs/FEATURES.md"), "utf8");
    expect(onDisk).toBe(featureDocsMarkdown());
  });

  it("keeps docs/site MDX in sync with featureDocsFumadocsFiles()", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    for (const file of featureDocsFumadocsFiles()) {
      const onDisk = readFileSync(resolve(root, "docs/site/content/docs", file.path), "utf8");
      expect(onDisk, file.path).toBe(file.contents);
    }
  });
});
