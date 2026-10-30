import { invoke } from "@tauri-apps/api/core";
import { prepareRequest, prepareRequestAsync } from "./http-client";
import { canUseTauriIpc } from "./tauri-runtime";
import type { ApiRequest, Environment } from "@/types";

export type CodeSnippetId =
  | "curl"
  | "fetch"
  | "axios"
  | "httpie"
  | "python"
  | "go"
  | "okhttp"
  | "reqwest"
  | "swift";

export type CodeSnippet = {
  id: CodeSnippetId;
  label: string;
  language: string;
};

export const CODE_SNIPPETS: CodeSnippet[] = [
  { id: "curl", label: "cURL", language: "bash" },
  { id: "fetch", label: "JavaScript (fetch)", language: "javascript" },
  { id: "axios", label: "JavaScript (axios)", language: "javascript" },
  { id: "httpie", label: "HTTPie", language: "bash" },
  { id: "python", label: "Python (requests)", language: "python" },
  { id: "go", label: "Go (net/http)", language: "go" },
  { id: "okhttp", label: "Java (OkHttp)", language: "java" },
  { id: "reqwest", label: "Rust (reqwest)", language: "rust" },
  { id: "swift", label: "Swift (URLSession)", language: "swift" },
];

function enabledHeaders(request: ApiRequest): Array<{ key: string; value: string }> {
  return request.headers
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => ({ key: item.key.trim(), value: item.value }));
}

function withAuthHeaders(request: ApiRequest): Array<{ key: string; value: string }> {
  const headers = enabledHeaders(request);
  const hasAuth = headers.some((item) => item.key.toLowerCase() === "authorization");
  if (!hasAuth && request.auth.authType === "bearer" && request.auth.bearerToken.trim()) {
    headers.push({ key: "Authorization", value: `Bearer ${request.auth.bearerToken.trim()}` });
  }
  if (!hasAuth && request.auth.authType === "basic") {
    const token = btoa(`${request.auth.basicUsername}:${request.auth.basicPassword}`);
    headers.push({ key: "Authorization", value: `Basic ${token}` });
  }
  return headers;
}

function bodyText(request: ApiRequest): string {
  if (request.bodyKind === "none") return "";
  if (request.bodyKind === "form") {
    return request.form
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => `${encodeURIComponent(item.key.trim())}=${encodeURIComponent(item.value)}`)
      .join("&");
  }
  return request.body;
}

/** Go remains local — pulse-core snippets do not emit net/http yet. */
function toGo(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = bodyText(request);
  const lines = [
    "package main",
    "",
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    '\t"strings"',
    ")",
    "",
    "func main() {",
    `\tmethod := ${JSON.stringify(request.method)}`,
    `\turl := ${JSON.stringify(request.url)}`,
  ];
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    lines.push(`\tbody := strings.NewReader(${JSON.stringify(body)})`);
    lines.push("\treq, err := http.NewRequest(method, url, body)");
  } else {
    lines.push("\treq, err := http.NewRequest(method, url, nil)");
  }
  lines.push("\tif err != nil { panic(err) }");
  for (const header of headers) {
    lines.push(`\treq.Header.Set(${JSON.stringify(header.key)}, ${JSON.stringify(header.value)})`);
  }
  lines.push(
    "\tres, err := http.DefaultClient.Do(req)",
    "\tif err != nil { panic(err) }",
    "\tdefer res.Body.Close()",
    "\tdata, _ := io.ReadAll(res.Body)",
    '\tfmt.Println(res.StatusCode)',
    "\tfmt.Println(string(data))",
    "}",
  );
  return lines.join("\n");
}

function toSnippetPayload(prepared: ApiRequest) {
  return {
    method: prepared.method,
    url: prepared.url,
    headers: prepared.headers.filter((item) => item.enabled && item.key.trim()),
    query: prepared.query.filter((item) => item.enabled && item.key.trim()),
    bodyKind: prepared.bodyKind,
    body: prepared.body,
    form: prepared.form.filter((item) => item.enabled && item.key.trim()),
    multipart: prepared.multipart
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => ({
        key: item.key.trim(),
        enabled: true,
        fieldType: item.fieldType,
        value: item.value,
        fileName: item.fileName ?? null,
        mimeType: item.mimeType ?? null,
      })),
    auth: {
      authType: prepared.auth.authType === "inherit" ? "none" : prepared.auth.authType,
      bearerToken: prepared.auth.bearerToken,
      basicUsername: prepared.auth.basicUsername,
      basicPassword: prepared.auth.basicPassword,
      apiKeyKey: prepared.auth.apiKeyKey,
      apiKeyValue: prepared.auth.apiKeyValue,
      apiKeyIn: prepared.auth.apiKeyIn,
    },
  };
}

/** Generate a code snippet via pulse-core (`generate_code_snippet`). Go stays local. */
export async function requestToSnippetAsync(
  id: CodeSnippetId,
  request: ApiRequest,
  environment: Environment | null = null,
): Promise<string> {
  const prepared = canUseTauriIpc()
    ? await prepareRequestAsync(request, environment)
    : prepareRequest(request, environment);
  if (id === "go") return toGo(prepared);
  if (!canUseTauriIpc()) {
    throw new Error("Code snippets require the desktop app");
  }
  return invoke<string>("generate_code_snippet", {
    payload: toSnippetPayload(prepared),
    format: id,
  });
}
