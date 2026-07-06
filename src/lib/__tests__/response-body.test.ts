import { describe, expect, it } from "vitest";
import {
  canFormatAsJson,
  formatResponseBody,
  isJsonContentType,
  looksLikeJson,
} from "../response-body";

describe("response-body", () => {
  it.each([
    ["application/json", true],
    ["application/problem+json", true],
    ["text/html", false],
    [null, false],
  ] as const)("isJsonContentType(%j)", (contentType, expected) => {
    expect(isJsonContentType(contentType)).toBe(expected);
  });

  it.each([
    ['{"a":1}', true],
    ["[1,2]", true],
    ["<html>", false],
    ["{broken", false],
  ] as const)("looksLikeJson(%j)", (value, expected) => {
    expect(looksLikeJson(value)).toBe(expected);
  });

  it("formats raw body unchanged", () => {
    const result = formatResponseBody("<html></html>", "text/html", "raw");
    expect(result.text).toBe("<html></html>");
    expect(result.jsonValid).toBeNull();
  });

  it("formats json mode for valid json", () => {
    const result = formatResponseBody('{"a":1}', "text/html", "json");
    expect(result.text).toBe('{\n  "a": 1\n}');
    expect(result.jsonValid).toBe(true);
  });

  it("marks invalid json in json mode", () => {
    const result = formatResponseBody("not json", "text/plain", "json");
    expect(result.jsonValid).toBe(false);
    expect(result.text).toBe("not json");
  });

  it("pretty mode formats json without json content-type", () => {
    const result = formatResponseBody('{"ok":true}', "text/plain", "pretty");
    expect(result.text).toContain('"ok": true');
  });

  it("canFormatAsJson detects json bodies", () => {
    expect(canFormatAsJson('{"x":1}')).toBe(true);
    expect(canFormatAsJson("<p>hi</p>")).toBe(false);
  });
});
