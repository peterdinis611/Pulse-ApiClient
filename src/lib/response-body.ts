import { formatGraphqlResponse, parseGraphqlResponse } from "@/lib/graphql";
import { prettyJson } from "@/lib/helpers";
import type { HttpResponse } from "@/types";

export type ResponseBodyFormat = "pretty" | "raw" | "json" | "preview";

export type ResponsePreviewKind = "text" | "image" | "pdf" | "excel" | "binary";

export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return normalized === "application/json" || normalized.endsWith("+json");
}

export function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function canFormatAsJson(value: string): boolean {
  return looksLikeJson(value);
}

function normalizedMime(contentType: string | null | undefined): string {
  return contentType?.toLowerCase().split(";")[0]?.trim() ?? "";
}

export function detectPreviewKind(
  contentType: string | null | undefined,
  bodyEncoding?: string | null,
): ResponsePreviewKind {
  const mime = normalizedMime(contentType);
  const isBase64 = bodyEncoding === "base64";

  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || mime.endsWith("/pdf")) return "pdf";
  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    mime === "application/vnd.ms-excel" ||
    mime === "text/csv" ||
    mime === "application/csv"
  ) {
    return "excel";
  }

  if (isBase64) return "binary";
  return "text";
}

export function defaultResponseBodyFormat(
  body: string,
  contentType: string | null | undefined,
  bodyEncoding?: string | null,
): ResponseBodyFormat {
  const kind = detectPreviewKind(contentType, bodyEncoding);
  if (kind === "image" || kind === "pdf" || kind === "excel") return "preview";
  if (isJsonContentType(contentType) || looksLikeJson(body)) return "pretty";
  return "pretty";
}

export function formatResponseBody(
  body: string,
  contentType: string | null | undefined,
  format: ResponseBodyFormat,
): { text: string; jsonValid: boolean | null } {
  if (format === "preview") {
    return { text: body, jsonValid: null };
  }

  if (format === "raw") {
    return { text: body, jsonValid: null };
  }

  if (format === "json") {
    const trimmed = body.trim();
    if (!trimmed) return { text: "(empty body)", jsonValid: true };

    try {
      return { text: JSON.stringify(JSON.parse(trimmed), null, 2), jsonValid: true };
    } catch {
      return { text: body, jsonValid: false };
    }
  }

  const graphql = parseGraphqlResponse(body);
  if (graphql) {
    return { text: formatGraphqlResponse(body), jsonValid: null };
  }

  if (isJsonContentType(contentType) || looksLikeJson(body)) {
    return { text: prettyJson(body), jsonValid: null };
  }

  return { text: body, jsonValid: null };
}

export function decodeResponseBytes(response: Pick<HttpResponse, "body" | "bodyEncoding">): Uint8Array {
  if (response.bodyEncoding === "base64") {
    const binary = atob(response.body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new TextEncoder().encode(response.body);
}

export function responseMimeType(contentType: string | null | undefined, kind: ResponsePreviewKind): string {
  const mime = normalizedMime(contentType);
  if (mime) return mime;
  if (kind === "pdf") return "application/pdf";
  if (kind === "excel") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (kind === "image") return "application/octet-stream";
  return "application/octet-stream";
}

export function suggestedDownloadFilename(
  contentType: string | null | undefined,
  kind: ResponsePreviewKind,
): string {
  const mime = normalizedMime(contentType);
  if (kind === "image") {
    if (mime.includes("png")) return "response.png";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "response.jpg";
    if (mime.includes("gif")) return "response.gif";
    if (mime.includes("webp")) return "response.webp";
    if (mime.includes("svg")) return "response.svg";
    return "response.img";
  }
  if (kind === "pdf") return "response.pdf";
  if (kind === "excel") {
    if (mime.includes("csv") || mime === "text/csv") return "response.csv";
    if (mime.includes("ms-excel") && !mime.includes("openxml")) return "response.xls";
    return "response.xlsx";
  }
  return "response.bin";
}
