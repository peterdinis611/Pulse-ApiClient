import { describe, expect, it } from "vitest";
import { prettyMaybeJson, unifiedLineDiff } from "@/lib/line-diff";

describe("line diff", () => {
  it("marks added and removed lines", () => {
    const rows = unifiedLineDiff("a\nb\n", "a\nc\n");
    expect(rows.some((row) => row.kind === "del" && row.text === "b")).toBe(true);
    expect(rows.some((row) => row.kind === "add" && row.text === "c")).toBe(true);
  });

  it("pretty-prints json when possible", () => {
    expect(prettyMaybeJson('{"a":1}')).toContain("\n");
    expect(prettyMaybeJson("not-json")).toBe("not-json");
  });
});
