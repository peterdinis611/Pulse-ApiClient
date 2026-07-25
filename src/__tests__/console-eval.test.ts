import { describe, expect, it } from "vitest";
import type { HttpResponse } from "@/types";
import {
  CONSOLE_HELP,
  prepareConsoleScript,
  tryEvalConsoleRead,
} from "@/lib/console-eval";

const sampleResponse: HttpResponse = {
  status: 200,
  statusText: "OK",
  headers: [{ key: "Content-Type", value: "application/json" }],
  body: '{"id":42}',
  elapsedMs: 120,
  sizeBytes: 9,
};

describe("console-eval", () => {
  it("returns help text", () => {
    expect(tryEvalConsoleRead("help", sampleResponse)).toBe(CONSOLE_HELP);
  });

  it("reads status and json helpers", () => {
    expect(tryEvalConsoleRead("status", sampleResponse)).toBe("200");
    expect(tryEvalConsoleRead("json()", sampleResponse)).toContain('"id": 42');
  });

  it("reads headers and header values", () => {
    expect(tryEvalConsoleRead("headers", sampleResponse)).toContain("Content-Type");
    expect(tryEvalConsoleRead('headers.get("Content-Type")', sampleResponse)).toBe(
      "application/json",
    );
  });

  it("wraps bare assertions in a pulse.test block", () => {
    expect(prepareConsoleScript("pulse.response.to.have.status(200)")).toContain(
      'pulse.test("Console"',
    );
    expect(prepareConsoleScript('pulse.test("x", function () {})')).not.toContain(
      'pulse.test("Console"',
    );
  });

  it("normalizes pm syntax", () => {
    expect(prepareConsoleScript("pm.response.to.have.status(200)")).toContain("pulse.response");
  });
});
