import { requestToCurl } from "./curl";
import { prepareRequest } from "./http-client";
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
  if (request.auth.authType === "apiKey" && request.auth.apiKeyKey.trim()) {
    if (request.auth.apiKeyIn === "header") {
      const exists = headers.some(
        (item) => item.key.toLowerCase() === request.auth.apiKeyKey.trim().toLowerCase(),
      );
      if (!exists) {
        headers.push({ key: request.auth.apiKeyKey.trim(), value: request.auth.apiKeyValue });
      }
    }
  }
  if (
    (request.bodyKind === "json" || request.bodyKind === "graphql") &&
    !headers.some((item) => item.key.toLowerCase() === "content-type")
  ) {
    headers.push({ key: "Content-Type", value: "application/json" });
  }
  return headers;
}

function requestBody(request: ApiRequest): string | null {
  if (request.bodyKind === "json" || request.bodyKind === "raw" || request.bodyKind === "graphql") {
    return request.body.trim() ? request.body : null;
  }
  if (request.bodyKind === "form") {
    const fields = request.form.filter((item) => item.enabled && item.key.trim());
    if (!fields.length) return null;
    return fields
      .map((item) => `${encodeURIComponent(item.key.trim())}=${encodeURIComponent(item.value)}`)
      .join("&");
  }
  return null;
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

function pythonString(value: string): string {
  return JSON.stringify(value);
}

function goString(value: string): string {
  return JSON.stringify(value);
}

function toFetch(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = requestBody(request);
  const headerLines = headers.map((item) => `    ${jsString(item.key)}: ${jsString(item.value)},`).join("\n");
  const init: string[] = [`  method: ${jsString(request.method)},`];
  if (headers.length) init.push(`  headers: {\n${headerLines}\n  },`);
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    init.push(`  body: ${jsString(body)},`);
  }
  return `const response = await fetch(${jsString(request.url)}, {\n${init.join("\n")}\n});\nconst data = await response.json();`;
}

function toAxios(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = requestBody(request);
  const lines = [
    `method: ${jsString(request.method.toLowerCase())},`,
    `url: ${jsString(request.url)},`,
  ];
  if (headers.length) {
    lines.push(
      `headers: {\n${headers.map((item) => `    ${jsString(item.key)}: ${jsString(item.value)},`).join("\n")}\n  },`,
    );
  }
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    lines.push(`data: ${jsString(body)},`);
  }
  return `import axios from "axios";\n\nconst response = await axios({\n  ${lines.join("\n  ")}\n});`;
}

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./:?&=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toHttpie(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const parts = ["http", request.method, shellEscape(request.url)];
  for (const header of headers) {
    parts.push(`${header.key}:${shellEscape(header.value)}`);
  }
  const body = requestBody(request);
  if (body && (request.bodyKind === "json" || request.bodyKind === "graphql")) {
    return `${parts.join(" ")} <<< ${shellEscape(body)}`;
  }
  if (body) {
    parts.push(`body='${body.replace(/'/g, `'\\''`)}'`);
  }
  return parts.join(" ");
}

function toPython(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = requestBody(request);
  const lines = ["import requests", "", `url = ${pythonString(request.url)}`];
  if (headers.length) {
    lines.push("headers = {");
    for (const header of headers) {
      lines.push(`    ${pythonString(header.key)}: ${pythonString(header.value)},`);
    }
    lines.push("}");
  }
  const args = ["url"];
  if (headers.length) args.push("headers=headers");
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    if (request.bodyKind === "json" || request.bodyKind === "graphql") {
      lines.push(`payload = ${body.trim().startsWith("{") || body.trim().startsWith("[") ? body : pythonString(body)}`);
      args.push("json=payload");
    } else {
      lines.push(`data = ${pythonString(body)}`);
      args.push("data=data");
    }
  }
  const method = request.method.toLowerCase();
  const fn = ["get", "post", "put", "patch", "delete", "head", "options"].includes(method)
    ? method
    : "request";
  if (fn === "request") {
    lines.push(`response = requests.request(${pythonString(request.method)}, ${args.join(", ")})`);
  } else {
    lines.push(`response = requests.${fn}(${args.join(", ")})`);
  }
  lines.push("print(response.status_code)", "print(response.text)");
  return lines.join("\n");
}

function toGo(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = requestBody(request);
  const lines = [
    "package main",
    "",
    `import (`,
    `  "fmt"`,
    `  "io"`,
    `  "net/http"`,
    `  "strings"`,
    `)`,
    "",
    "func main() {",
  ];
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    lines.push(`  body := strings.NewReader(${goString(body)})`);
    lines.push(
      `  req, err := http.NewRequest(${goString(request.method)}, ${goString(request.url)}, body)`,
    );
  } else {
    lines.push(
      `  req, err := http.NewRequest(${goString(request.method)}, ${goString(request.url)}, nil)`,
    );
  }
  lines.push(`  if err != nil { panic(err) }`);
  for (const header of headers) {
    lines.push(`  req.Header.Set(${goString(header.key)}, ${goString(header.value)})`);
  }
  lines.push(
    `  res, err := http.DefaultClient.Do(req)`,
    `  if err != nil { panic(err) }`,
    `  defer res.Body.Close()`,
    `  data, _ := io.ReadAll(res.Body)`,
    `  fmt.Println(res.Status)`,
    `  fmt.Println(string(data))`,
    `}`,
  );
  return lines.join("\n");
}

function javaString(value: string): string {
  return JSON.stringify(value);
}

function toOkHttp(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = requestBody(request);
  const lines = [
    "OkHttpClient client = new OkHttpClient();",
    "",
  ];
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    const media =
      request.bodyKind === "json" || request.bodyKind === "graphql"
        ? "application/json"
        : "text/plain";
    lines.push(
      `RequestBody body = RequestBody.create(${javaString(body)}, MediaType.parse(${javaString(media)}));`,
    );
  }
  lines.push("Request.Builder builder = new Request.Builder()");
  lines.push(`    .url(${javaString(request.url)})`);
  lines.push(`    .method(${javaString(request.method)}, ${body && request.method !== "GET" && request.method !== "HEAD" ? "body" : "null"});`);
  for (const header of headers) {
    lines.push(`builder.addHeader(${javaString(header.key)}, ${javaString(header.value)});`);
  }
  lines.push(
    "Request request = builder.build();",
    "try (Response response = client.newCall(request).execute()) {",
    "    System.out.println(response.code());",
    "    System.out.println(response.body() != null ? response.body().string() : \"\");",
    "}",
  );
  return lines.join("\n");
}

function toReqwest(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = requestBody(request);
  const lines = [
    "use reqwest::header::{HeaderMap, HeaderName, HeaderValue};",
    "",
    "#[tokio::main]",
    "async fn main() -> Result<(), Box<dyn std::error::Error>> {",
    "    let client = reqwest::Client::new();",
    "    let mut headers = HeaderMap::new();",
  ];
  for (const header of headers) {
    lines.push(
      `    headers.insert(HeaderName::from_bytes(${JSON.stringify(header.key)}.as_bytes())?, HeaderValue::from_str(${JSON.stringify(header.value)})?);`,
    );
  }
  lines.push(
    `    let mut builder = client.request(reqwest::Method::from_bytes(${JSON.stringify(request.method)}.as_bytes())?, ${JSON.stringify(request.url)});`,
    "    builder = builder.headers(headers);",
  );
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    lines.push(`    builder = builder.body(${JSON.stringify(body)}.to_string());`);
  }
  lines.push(
    "    let response = builder.send().await?;",
    "    println!(\"{}\", response.status());",
    "    println!(\"{}\", response.text().await?);",
    "    Ok(())",
    "}",
  );
  return lines.join("\n");
}

function toSwift(request: ApiRequest): string {
  const headers = withAuthHeaders(request);
  const body = requestBody(request);
  const lines = [
    "import Foundation",
    "",
    `var request = URLRequest(url: URL(string: ${JSON.stringify(request.url)})!)`,
    `request.httpMethod = ${JSON.stringify(request.method)}`,
  ];
  for (const header of headers) {
    lines.push(
      `request.setValue(${JSON.stringify(header.value)}, forHTTPHeaderField: ${JSON.stringify(header.key)})`,
    );
  }
  if (body && request.method !== "GET" && request.method !== "HEAD") {
    lines.push(`request.httpBody = ${JSON.stringify(body)}.data(using: .utf8)`);
  }
  lines.push(
    "let task = URLSession.shared.dataTask(with: request) { data, response, error in",
    "    if let error = error { print(error); return }",
    "    if let http = response as? HTTPURLResponse { print(http.statusCode) }",
    "    if let data = data, let text = String(data: data, encoding: .utf8) { print(text) }",
    "}",
    "task.resume()",
  );
  return lines.join("\n");
}

export function requestToSnippet(
  id: CodeSnippetId,
  request: ApiRequest,
  environment: Environment | null = null,
): string {
  if (id === "curl") return requestToCurl(request, environment);
  const prepared = prepareRequest(request, environment);
  switch (id) {
    case "fetch":
      return toFetch(prepared);
    case "axios":
      return toAxios(prepared);
    case "httpie":
      return toHttpie(prepared);
    case "python":
      return toPython(prepared);
    case "go":
      return toGo(prepared);
    case "okhttp":
      return toOkHttp(prepared);
    case "reqwest":
      return toReqwest(prepared);
    case "swift":
      return toSwift(prepared);
  }
}
