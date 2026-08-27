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

  it("strips a UTF-8 BOM and accepts CRLF rows", () => {
    const parsed = parseRunnerDataFile("\uFEFFid,name\r\n1,Ada\r\n2,Bob\r\n", "users.csv");
    expect(parsed.rows).toEqual([
      { id: "1", name: "Ada" },
      { id: "2", name: "Bob" },
    ]);
  });

  it("unescapes doubled CSV quotes", () => {
    const parsed = parseRunnerDataFile('title,body\n"He said ""hi""","ok"\n', "quotes.csv");
    expect(parsed.rows[0]).toEqual({ title: 'He said "hi"', body: "ok" });
  });

  it("skips blank data rows and names empty headers", () => {
    const parsed = parseRunnerDataFile("id,,token\n1,x,abc\n,,\n2,,def\n", "sparse.csv");
    expect(parsed.rows).toEqual([
      { id: "1", col_2: "x", token: "abc" },
      { id: "2", col_2: "", token: "def" },
    ]);
  });

  it("stringifies nested JSON values and skips blank keys", () => {
    const parsed = parseRunnerDataFile(
      JSON.stringify([{ userId: "u1", meta: { role: "admin" }, "": "ignore" }]),
      "nested.json",
    );
    expect(parsed.rows[0]).toEqual({ userId: "u1", meta: '{"role":"admin"}' });
  });

  it("turns JSON array primitives into a value column", () => {
    const parsed = parseRunnerDataFile(JSON.stringify(["a", 2]), "list.json");
    expect(parsed.rows).toEqual([{ value: "a" }, { value: "2" }]);
  });

  it("rejects header-only CSV, unclosed quotes, and invalid JSON", () => {
    expect(() => parseRunnerDataFile("id,token\n", "header.csv")).toThrow(/no iterations/i);
    expect(() => parseRunnerDataFile('id,note\n1,"oops\n', "bad.csv")).toThrow(/unclosed quote/i);
    expect(() => parseRunnerDataFile("{not json", "broken.json")).toThrow(/not valid JSON/i);
    expect(() => parseRunnerDataFile("42", "number.json")).toThrow(/array of objects/i);
  });
});
