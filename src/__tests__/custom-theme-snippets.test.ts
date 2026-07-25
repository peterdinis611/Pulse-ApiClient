import { describe, expect, it } from "vitest";
import {
  appendCssBlock,
  CUSTOM_CSS_COMPONENT_HOOKS,
  CUSTOM_CSS_SNIPPETS,
  CUSTOM_CSS_TOKEN_GROUPS,
  insertCssToken,
} from "@/lib/custom-theme-snippets";

describe("custom-theme-snippets catalog", () => {
  it("ships non-empty snippets, token groups, and component hooks", () => {
    expect(CUSTOM_CSS_SNIPPETS.length).toBeGreaterThan(5);
    expect(CUSTOM_CSS_TOKEN_GROUPS.length).toBeGreaterThan(3);
    expect(CUSTOM_CSS_COMPONENT_HOOKS.length).toBeGreaterThan(5);
    expect(CUSTOM_CSS_SNIPPETS.every((item) => item.css.includes("{"))).toBe(true);
    expect(CUSTOM_CSS_COMPONENT_HOOKS.every((hook) => hook.name.startsWith("."))).toBe(true);
  });

  it("keeps snippet ids unique and descriptions filled in", () => {
    const ids = CUSTOM_CSS_SNIPPETS.map((snippet) => snippet.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      CUSTOM_CSS_SNIPPETS.every(
        (snippet) => snippet.label.trim() && snippet.description.trim() && snippet.css.trim(),
      ),
    ).toBe(true);
  });

  it("exposes unique css tokens across groups", () => {
    const tokens = CUSTOM_CSS_TOKEN_GROUPS.flatMap((group) =>
      group.tokens.map((token) => token.name),
    );
    expect(tokens.every((name) => name.startsWith("--"))).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("includes brand, chrome, and method tokens used by the editor", () => {
    const tokens = new Set(
      CUSTOM_CSS_TOKEN_GROUPS.flatMap((group) => group.tokens.map((token) => token.name)),
    );
    for (const required of [
      "--primary",
      "--background",
      "--sidebar",
      "--rail",
      "--method-get",
      "--radius",
      "--font-mono",
    ]) {
      expect(tokens.has(required)).toBe(true);
    }
  });
});

describe("appendCssBlock", () => {
  it("appends css blocks without duplicating identical content", () => {
    const block = `:root {\n  --primary: oklch(0.5 0.1 200);\n}`;
    const once = appendCssBlock("", block);
    expect(once).toContain("--primary");
    expect(once.endsWith("\n")).toBe(true);
    const twice = appendCssBlock(once, block);
    expect(twice).toBe(once);
  });

  it("returns the current css when the block is empty", () => {
    expect(appendCssBlock(":root {}", "   ")).toBe(":root {}");
    expect(appendCssBlock("  ", "  ")).toBe("  ");
  });

  it("separates existing css and a new block with a blank line", () => {
    const next = appendCssBlock(":root { --a: 1; }", ".panel { color: red; }");
    expect(next).toBe(":root { --a: 1; }\n\n.panel { color: red; }\n");
  });
});

describe("insertCssToken", () => {
  it("inserts tokens into an existing :root block", () => {
    const base = `:root {\n  --radius: 0.5rem;\n}\n`;
    const next = insertCssToken(base, "--primary");
    expect(next).toContain("--primary:");
    expect(next).toContain("--radius: 0.5rem;");
  });

  it("creates :root when inserting a token into empty css", () => {
    const next = insertCssToken("", "--sidebar");
    expect(next).toContain(":root {");
    expect(next).toContain("--sidebar:");
  });

  it("does not duplicate an already present token", () => {
    const base = `:root {\n  --primary: red;\n}\n`;
    expect(insertCssToken(base, "--primary")).toBe(base);
  });

  it("falls back to appending a new :root when the existing one has no brace", () => {
    const next = insertCssToken(":root", "--ring");
    expect(next).toContain(":root {");
    expect(next).toContain("--ring:");
  });
});
