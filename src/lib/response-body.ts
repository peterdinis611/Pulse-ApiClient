import { formatGraphqlResponse, parseGraphqlResponse } from "@/lib/graphql";
import { prettyJson } from "@/lib/helpers";

export type ResponseBodyFormat = "pretty" | "raw" | "json";

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

export function defaultResponseBodyFormat(
  body: string,
  contentType: string | null | undefined,
): ResponseBodyFormat {
  if (isJsonContentType(contentType) || looksLikeJson(body)) return "pretty";
  return "pretty";
}

export function formatResponseBody(
  body: string,
  contentType: string | null | undefined,
  format: ResponseBodyFormat,
): { text: string; jsonValid: boolean | null } {
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
