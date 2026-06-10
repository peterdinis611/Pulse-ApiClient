import { prepareRequest } from "./http-client";
import { createKeyValue, createRequest } from "./helpers";
import type { ApiRequest, Environment, HttpMethod, KeyValue } from "@/types";

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./:?&=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function enabledHeaders(request: ApiRequest): KeyValue[] {
  return request.headers.filter((item) => item.enabled && item.key.trim());
}

export function requestToCurl(request: ApiRequest, environment: Environment | null = null): string {
  const prepared = prepareRequest(request, environment);
  const parts: string[] = ["curl"];

  if (prepared.method !== "GET") {
    parts.push("-X", prepared.method);
  }

  const headerKeys = new Set<string>();
  for (const header of enabledHeaders(prepared)) {
    const key = header.key.trim();
    headerKeys.add(key.toLowerCase());
    parts.push("-H", shellEscape(`${key}: ${header.value}`));
  }

  if (prepared.auth.authType === "bearer" && prepared.auth.bearerToken.trim()) {
    if (!headerKeys.has("authorization")) {
      parts.push("-H", shellEscape(`Authorization: Bearer ${prepared.auth.bearerToken.trim()}`));
    }
  }

  if (prepared.auth.authType === "basic") {
    const user = prepared.auth.basicUsername;
    const pass = prepared.auth.basicPassword;
    if (user || pass) {
      parts.push("-u", shellEscape(`${user}:${pass}`));
    }
  }

  if (prepared.bodyKind === "json" && prepared.body.trim()) {
    if (!headerKeys.has("content-type")) {
      parts.push("-H", shellEscape("Content-Type: application/json"));
    }
    parts.push("--data-raw", shellEscape(prepared.body));
  } else if (prepared.bodyKind === "raw" && prepared.body.trim()) {
    parts.push("--data-raw", shellEscape(prepared.body));
  } else if (prepared.bodyKind === "form") {
    const fields = prepared.form.filter((item) => item.enabled && item.key.trim());
    for (const field of fields) {
      parts.push("--data-urlencode", shellEscape(`${field.key.trim()}=${field.value}`));
    }
  }

  parts.push(shellEscape(prepared.url.trim()));
  return parts.join(" ");
}

function extractFlagValues(input: string, flags: string[]): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`(?:${flags.map((flag) => flag.replace(/-/g, "\\-")).join("|")})\\s+('([^']*)'|"([^"]*)"|(\\S+))`, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    values.push(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return values;
}

function extractUrl(input: string): string {
  const normalized = input.replace(/\\\s*\n/g, " ").trim();
  const urlMatch = normalized.match(/https?:\/\/[^\s'"]+/i);
  if (urlMatch) return urlMatch[0];
  const quoted = normalized.match(/'([^']+)'|"([^"]+)"/g);
  if (quoted?.length) {
    const candidate = quoted[quoted.length - 1].slice(1, -1);
    if (candidate.startsWith("http")) return candidate;
  }
  throw new Error("Could not find URL in cURL command");
}

export function curlToRequest(raw: string): ApiRequest {
  const normalized = raw.replace(/\\\s*\n/g, " ").trim();
  if (!normalized.toLowerCase().includes("curl")) {
    throw new Error("Input does not look like a cURL command");
  }

  const methodMatch = normalized.match(/-X\s+('([^']+)'|"([^"]+)"|(\S+))/i);
  const method = (methodMatch?.[2] ?? methodMatch?.[3] ?? methodMatch?.[4] ?? "GET").toUpperCase() as HttpMethod;

  const url = extractUrl(normalized);
  const headers = extractFlagValues(normalized, ["-H", "--header"]).map((value) => {
    const separator = value.indexOf(":");
    if (separator === -1) {
      return createKeyValue({ key: value.trim(), value: "" });
    }
    return createKeyValue({
      key: value.slice(0, separator).trim(),
      value: value.slice(separator + 1).trim(),
    });
  });

  const dataValues = extractFlagValues(normalized, ["--data-raw", "--data", "-d", "--data-binary"]);
  const body =
    (dataValues.length > 0 ? dataValues[dataValues.length - 1] : undefined) ??
    extractFlagValues(normalized, ["--data-urlencode"]).join("&");

  const request = createRequest({
    method,
    url,
    headers: headers.length > 0 ? headers : undefined,
    bodyKind: body ? (body.trim().startsWith("{") ? "json" : "raw") : "none",
    body: body || '{\n  \n}',
  });

  const authHeader = headers.find((item) => item.key.toLowerCase() === "authorization");
  if (authHeader?.value.toLowerCase().startsWith("bearer ")) {
    request.auth = {
      ...request.auth,
      authType: "bearer",
      bearerToken: authHeader.value.slice(7).trim(),
    };
  }

  const basicMatch = normalized.match(/-u\s+('([^']+)'|"([^"]+)"|(\S+))/i);
  if (basicMatch) {
    const creds = basicMatch[2] ?? basicMatch[3] ?? basicMatch[4] ?? "";
    const [username, password = ""] = creds.split(":");
    request.auth = {
      ...request.auth,
      authType: "basic",
      basicUsername: username,
      basicPassword: password,
    };
  }

  return request;
}
