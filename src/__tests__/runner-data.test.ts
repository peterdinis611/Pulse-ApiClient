import { describe, expect, it } from "vitest";
import { parseRunnerDataFile } from "@/lib/runner-data";

describe("runner-data", () => {
  it("parses CSV with a header row into iterations", () => {
    const parsed = parseRunnerDataFile("id,token\n1,abc\n2,def\n", "users.csv");
    expect(parsed.rows).toEqual([
      { id: "1", token: "abc" },
      { id: "2", token: "def" },
    ]);
  });

  it("parses quoted CSV fields", () => {
    const parsed = parseRunnerDataFile('name,note\n"Ada","hello, world"\n', "notes.csv");
    expect(parsed.rows[0]).toEqual({ name: "Ada", note: "hello, world" });
  });

  it("parses a JSON array of objects", () => {
    const parsed = parseRunnerDataFile(
      JSON.stringify([{ userId: "u1" }, { userId: "u2", extra: 3 }]),
      "rows.json",
    );
    expect(parsed.rows).toEqual([
      { userId: "u1" },
      { userId: "u2", extra: "3" },
    ]);
  });

  it("treats a single JSON object as one iteration", () => {
    const parsed = parseRunnerDataFile(JSON.stringify({ token: "abc" }), "one.json");
    expect(parsed.rows).toEqual([{ token: "abc" }]);
  });

  it("rejects an empty file", () => {
    expect(() => parseRunnerDataFile(" \n", "empty.csv")).toThrow(/empty/i);
  });
});
