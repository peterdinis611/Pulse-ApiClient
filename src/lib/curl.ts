import { prepareRequest } from "./http-client";
import { createKeyValue, createRequest } from "./helpers";
import type { ApiRequest, Environment, HttpMethod, KeyValue, MultipartField } from "@/types";

function shellEscape(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./:?&=%@,+~-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function enabledHeaders(request: ApiRequest): KeyValue[] {
  return request.headers.filter((item) => item.enabled && item.key.trim());
}

function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "%20");
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

  if (prepared.auth.authType === "apiKey") {
    const key = prepared.auth.apiKeyKey.trim();
    if (key && prepared.auth.apiKeyIn !== "query" && !headerKeys.has(key.toLowerCase())) {
      parts.push("-H", shellEscape(`${key}: ${prepared.auth.apiKeyValue}`));
    }
  }

  let url = prepared.url.trim();
  const query = prepared.query.filter((item) => item.enabled && item.key.trim());
  if (query.length > 0) {
    const qs = query
      .map((item) => `${encodeComponent(item.key.trim())}=${encodeComponent(item.value)}`)
      .join("&");
    url += url.includes("?") ? `&${qs}` : `?${qs}`;
  }

  if ((prepared.bodyKind === "json" || prepared.bodyKind === "graphql") && prepared.body.trim()) {
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
  } else if (prepared.bodyKind === "multipart") {
    for (const field of prepared.multipart.filter((item) => item.enabled && item.key.trim())) {
      if (field.fieldType === "file") {
        const name = field.fileName || "file";
        let value = `${field.key.trim()}=@${name}`;
        if (field.mimeType) value += `;type=${field.mimeType}`;
        parts.push("-F", shellEscape(value));
      } else {
        parts.push("-F", shellEscape(`${field.key.trim()}=${field.value}`));
      }
    }
  }

  parts.push("--compressed");
  parts.push(shellEscape(url));
  return parts.join(" ");
}

function extractFlagValues(input: string, flags: string[]): string[] {
  const values: string[] = [];
  const pattern = new RegExp(
    `(?:${flags.map((flag) => flag.replace(/-/g, "\\-")).join("|")})\\s+('([^']*)'|"([^"]*)"|(\\S+))`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    values.push(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return values;
}

function hasBoolFlag(input: string, flags: string[]): boolean {
  const pattern = new RegExp(`(?:${flags.map((flag) => flag.replace(/-/g, "\\-")).join("|")})(?![A-Za-z0-9_-])`, "i");
  return pattern.test(input);
}

function extractUrl(input: string): string {
  const normalized = input.replace(/\\\s*\n/g, " ").trim();
  const urlFlag = extractFlagValues(normalized, ["--url"]);
  if (urlFlag[0]) return urlFlag[0];
  const urlMatch = normalized.match(/https?:\/\/[^\s'"]+/i);
  if (urlMatch) return urlMatch[0];
  const quoted = normalized.match(/'([^']+)'|"([^"]+)"/g);
  if (quoted?.length) {
    const candidate = quoted[quoted.length - 1].slice(1, -1);
    if (candidate.startsWith("http")) return candidate;
  }
  throw new Error("Could not find URL in cURL command");
}

function parseFormField(raw: string): MultipartField {
  const eq = raw.indexOf("=");
  const key = (eq === -1 ? raw : raw.slice(0, eq)).trim();
  const rest = eq === -1 ? "" : raw.slice(eq + 1);
  if (rest.startsWith("@")) {
    const [pathPart, mime] = rest.slice(1).split(";type=");
    const fileName = pathPart.split(/[/\\]/).pop() || "file";
    return {
      id: crypto.randomUUID(),
      key,
      enabled: true,
      fieldType: "file",
      value: "",
      fileName,
      mimeType: mime || undefined,
    };
  }
  return {
    id: crypto.randomUUID(),
    key,
    enabled: true,
    fieldType: "text",
    value: rest,
  };
}

export function curlToRequest(raw: string): ApiRequest {
  const normalized = raw.replace(/\\\s*\n/g, " ").trim();
  if (!normalized.toLowerCase().includes("curl")) {
    throw new Error("Input does not look like a cURL command");
  }

  const methodMatch = normalized.match(/(?:-X|--request)\s+('([^']+)'|"([^"]+)"|(\S+))/i);
  let method = (methodMatch?.[2] ?? methodMatch?.[3] ?? methodMatch?.[4] ?? "").toUpperCase() as HttpMethod;

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

  for (const agent of extractFlagValues(normalized, ["-A", "--user-agent"])) {
    headers.push(createKeyValue({ key: "User-Agent", value: agent }));
  }
  for (const referer of extractFlagValues(normalized, ["-e", "--referer"])) {
    headers.push(createKeyValue({ key: "Referer", value: referer }));
  }
  for (const cookie of extractFlagValues(normalized, ["-b", "--cookie"])) {
    headers.push(createKeyValue({ key: "Cookie", value: cookie }));
  }

  const jsonBodies = extractFlagValues(normalized, ["--json"]);
  const dataValues = extractFlagValues(normalized, ["--data-raw", "--data", "-d", "--data-binary"]);
  const urlencode = extractFlagValues(normalized, ["--data-urlencode"]);
  const formFields = extractFlagValues(normalized, ["-F", "--form"]).map(parseFormField);

  const forceHead = hasBoolFlag(normalized, ["-I", "--head"]);
  const forceGet = hasBoolFlag(normalized, ["-G", "--get"]);

  let body =
    (jsonBodies.length > 0 ? jsonBodies[jsonBodies.length - 1] : undefined) ??
    (dataValues.length > 0 ? dataValues[dataValues.length - 1] : undefined) ??
    "";

  if (!method) {
    if (forceHead) method = "HEAD";
    else if (forceGet) method = "GET";
    else if (body || urlencode.length || formFields.length) method = "POST";
    else method = "GET";
  }
  if (forceHead) method = "HEAD";

  let bodyKind: ApiRequest["bodyKind"] = "none";
  let form: KeyValue[] | undefined;
  let multipart: MultipartField[] | undefined;
  let query: KeyValue[] | undefined;

  if (forceGet && body) {
    query = body.split("&").map((part) => {
      const [key, ...rest] = part.split("=");
      return createKeyValue({ key: key ?? "", value: rest.join("=") });
    });
    body = "";
  } else if (formFields.length > 0) {
    bodyKind = "multipart";
    multipart = formFields;
    body = "";
  } else if (urlencode.length > 0 && !body) {
    bodyKind = "form";
    form = urlencode.map((item) => {
      const [key, ...rest] = item.split("=");
      return createKeyValue({ key: (key ?? "").trim(), value: rest.join("=") });
    });
  } else if (body) {
    const trimmed = body.trim();
    bodyKind =
      jsonBodies.length > 0 || trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "raw";
  }

  const request = createRequest({
    method,
    url,
    headers: headers.length > 0 ? headers : undefined,
    query,
    bodyKind,
    body: body || "{\n  \n}",
    form,
    multipart,
  });

  const authHeader = headers.find((item) => item.key.toLowerCase() === "authorization");
  if (authHeader?.value.toLowerCase().startsWith("bearer ")) {
    request.auth = {
      ...request.auth,
      authType: "bearer",
      bearerToken: authHeader.value.slice(7).trim(),
    };
  }

  const basicMatch = normalized.match(/(?:-u|--user)\s+('([^']+)'|"([^"]+)"|(\S+))/i);
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
