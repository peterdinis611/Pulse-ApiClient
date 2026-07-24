import { describe, expect, it } from "vitest";
import {
  canFormatAsJson,
  defaultResponseBodyFormat,
  detectPreviewKind,
  formatResponseBody,
  isJsonContentType,
  looksLikeJson,
  suggestedDownloadFilename,
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

  it.each([
    ["image/png", "base64", "image"],
    ["application/pdf", "base64", "pdf"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "base64", "excel"],
    ["text/csv", "utf8", "excel"],
    ["application/json", "utf8", "text"],
    ["application/octet-stream", "base64", "binary"],
  ] as const)("detectPreviewKind(%j, %j)", (contentType, encoding, expected) => {
    expect(detectPreviewKind(contentType, encoding)).toBe(expected);
  });

  it("defaults media responses to preview format", () => {
    expect(defaultResponseBodyFormat("", "image/jpeg", "base64")).toBe("preview");
    expect(defaultResponseBodyFormat("", "application/pdf", "base64")).toBe("preview");
    expect(defaultResponseBodyFormat("a,b\n1,2", "text/csv", "utf8")).toBe("preview");
  });

  it("suggests download filenames from content type", () => {
    expect(suggestedDownloadFilename("image/png", "image")).toBe("response.png");
    expect(suggestedDownloadFilename("application/pdf", "pdf")).toBe("response.pdf");
    expect(suggestedDownloadFilename("text/csv", "excel")).toBe("response.csv");
  });
});
