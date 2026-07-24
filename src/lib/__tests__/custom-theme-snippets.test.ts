import { describe, expect, it } from "vitest";
import {
  appendCssBlock,
  CUSTOM_CSS_SNIPPETS,
  CUSTOM_CSS_TOKEN_GROUPS,
  insertCssToken,
} from "../custom-theme-snippets";

describe("custom-theme-snippets", () => {
  it("ships non-empty snippets and token groups", () => {
    expect(CUSTOM_CSS_SNIPPETS.length).toBeGreaterThan(5);
    expect(CUSTOM_CSS_TOKEN_GROUPS.length).toBeGreaterThan(3);
    expect(CUSTOM_CSS_SNIPPETS.every((item) => item.css.includes("{"))).toBe(true);
  });

  it("appends css blocks without duplicating identical content", () => {
    const block = `:root {\n  --primary: oklch(0.5 0.1 200);\n}`;
    const once = appendCssBlock("", block);
    expect(once).toContain("--primary");
    const twice = appendCssBlock(once, block);
    expect(twice).toBe(once);
  });

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
});
