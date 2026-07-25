import { describe, expect, it } from "vitest";
import {
  canFormatAsJson,
  decodeResponseBytes,
  defaultResponseBodyFormat,
  detectPreviewKind,
  formatResponseBody,
  isJsonContentType,
  looksLikeJson,
  responseMimeType,
  suggestedDownloadFilename,
} from "@/lib/response-body";

describe("response-body", () => {
  it.each([
    ["application/json", true],
    ["application/problem+json", true],
    ["application/json; charset=utf-8", true],
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
    ["", false],
  ] as const)("looksLikeJson(%j)", (value, expected) => {
    expect(looksLikeJson(value)).toBe(expected);
  });

  it("formats raw body unchanged", () => {
    const result = formatResponseBody("<html></html>", "text/html", "raw");
    expect(result.text).toBe("<html></html>");
    expect(result.jsonValid).toBeNull();
  });

  it("formats preview mode as passthrough", () => {
    const result = formatResponseBody("iVBORw0KGgo=", "image/png", "preview");
    expect(result.text).toBe("iVBORw0KGgo=");
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
    ["image/jpeg; charset=binary", "base64", "image"],
    ["image/svg+xml", "utf8", "image"],
    ["application/pdf", "base64", "pdf"],
    ["application/x-pdf", "base64", "pdf"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "base64", "excel"],
    ["application/vnd.ms-excel", "base64", "excel"],
    ["text/csv", "utf8", "excel"],
    ["application/csv", "utf8", "excel"],
    ["application/json", "utf8", "text"],
    ["text/plain", "utf8", "text"],
    ["application/octet-stream", "base64", "binary"],
    ["application/zip", "base64", "binary"],
    [null, "base64", "binary"],
    [null, "utf8", "text"],
  ] as const)("detectPreviewKind(%j, %j)", (contentType, encoding, expected) => {
    expect(detectPreviewKind(contentType, encoding)).toBe(expected);
  });

  it("defaults media responses to preview format", () => {
    expect(defaultResponseBodyFormat("", "image/jpeg", "base64")).toBe("preview");
    expect(defaultResponseBodyFormat("", "application/pdf", "base64")).toBe("preview");
    expect(defaultResponseBodyFormat("a,b\n1,2", "text/csv", "utf8")).toBe("preview");
    expect(defaultResponseBodyFormat('{"a":1}', "application/json", "utf8")).toBe("pretty");
    expect(defaultResponseBodyFormat("hello", "text/plain", "utf8")).toBe("pretty");
  });

  it("suggests download filenames from content type", () => {
    expect(suggestedDownloadFilename("image/png", "image")).toBe("response.png");
    expect(suggestedDownloadFilename("image/jpeg", "image")).toBe("response.jpg");
    expect(suggestedDownloadFilename("image/gif", "image")).toBe("response.gif");
    expect(suggestedDownloadFilename("image/webp", "image")).toBe("response.webp");
    expect(suggestedDownloadFilename("image/svg+xml", "image")).toBe("response.svg");
    expect(suggestedDownloadFilename("image/bmp", "image")).toBe("response.img");
    expect(suggestedDownloadFilename("application/pdf", "pdf")).toBe("response.pdf");
    expect(suggestedDownloadFilename("text/csv", "excel")).toBe("response.csv");
    expect(suggestedDownloadFilename("application/vnd.ms-excel", "excel")).toBe("response.xls");
    expect(
      suggestedDownloadFilename(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "excel",
      ),
    ).toBe("response.xlsx");
    expect(suggestedDownloadFilename("application/octet-stream", "binary")).toBe("response.bin");
  });

  it("resolves mime types with charset and fallbacks", () => {
    expect(responseMimeType("image/png; charset=binary", "image")).toBe("image/png");
    expect(responseMimeType(null, "pdf")).toBe("application/pdf");
    expect(responseMimeType(null, "excel")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(responseMimeType(null, "image")).toBe("application/octet-stream");
    expect(responseMimeType(null, "binary")).toBe("application/octet-stream");
  });

  it("decodes utf8 bodies via TextEncoder", () => {
    const bytes = decodeResponseBytes({ body: "hello ✓", bodyEncoding: "utf8" });
    expect(new TextDecoder().decode(bytes)).toBe("hello ✓");
  });

  it("decodes base64 bodies losslessly", () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
    let binary = "";
    for (const byte of original) binary += String.fromCharCode(byte);
    const encoded = btoa(binary);

    const decoded = decodeResponseBytes({ body: encoded, bodyEncoding: "base64" });
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("treats missing bodyEncoding as utf8", () => {
    const bytes = decodeResponseBytes({ body: "abc" });
    expect(Array.from(bytes)).toEqual([97, 98, 99]);
  });
});
