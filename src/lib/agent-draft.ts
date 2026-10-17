import type { ApiRequest, HttpResponse } from "@/types";

/** Heuristic test script from the last response (no LLM). */
export function draftTestsFromResponse(response: HttpResponse): string {
  const status = response.status;
  const ct = response.contentType?.toLowerCase() ?? "";
  const isJson =
    response.bodyEncoding !== "base64" &&
    (ct.includes("json") || /^\s*[{[]/.test(response.body));
  const lines: string[] = [];

  lines.push(`pulse.test("Status is ${status}", function () {
    pulse.response.to.have.status(${status});
});`);

  if (status >= 200 && status < 300) {
    lines.push(`pulse.test("Status is 2xx", function () {
    pulse.response.to.be.ok;
});`);
  }

  if (ct) {
    const token = ct.includes("json") ? "json" : ct.split(";")[0]?.trim() || "text";
    lines.push(`pulse.test("Content-Type includes ${token}", function () {
    pulse.expect(pulse.response.headers.get("Content-Type")).to.include("${token}");
});`);
  }

  if (isJson) {
    lines.push(`pulse.test("Body is JSON", function () {
    pulse.response.to.be.json;
});`);
    try {
      const parsed = JSON.parse(response.body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed as Record<string, unknown>).slice(0, 3)) {
          const safe = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          lines.push(`pulse.test("JSON has ${safe}", function () {
    pulse.expect(pulse.response.json()).to.have.property("${safe}");
});`);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return `${lines.join("\n\n")}\n`;
}

type PathHit = { env: string; accessors: string[] };

function collectTokenPaths(value: unknown, accessors: string[], out: PathHit[], depth: number) {
  if (depth > 3 || out.length >= 4 || value == null) return;
  if (Array.isArray(value)) {
    if (value.length > 0) collectTokenPaths(value[0], [...accessors, "[0]"], out, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = [...accessors, `.${key}`];
    const lower = key.toLowerCase();
    if (
      typeof child === "string" &&
      (lower.includes("token") ||
        lower.includes("access") ||
        lower === "id" ||
        lower.endsWith("_id") ||
        lower === "jwt")
    ) {
      out.push({
        env: key.replace(/[^a-zA-Z0-9_]/g, "_") || "value",
        accessors: next,
      });
    } else if (typeof child === "object" && child) {
      collectTokenPaths(child, next, out, depth + 1);
    }
    if (out.length >= 4) return;
  }
}

function pathExpr(accessors: string[]): string {
  // accessors like [".token"] or ["[0]", ".id"] → pulse.response.json()?.token
  let expr = "pulse.response.json()";
  for (const part of accessors) {
    if (part.startsWith("[")) expr += part;
    else expr += `?${part}`; // ?.key
  }
  return expr;
}

/** Heuristic pre-request script: capture token-like fields from last JSON body. */
export function draftPreRequestFromResponse(response: HttpResponse): string {
  const header = [
    `// Drafted from last response (${response.status}). Adjust paths as needed.`,
    `pulse.environment.set("lastStatus", "${response.status}");`,
  ];

  if (response.bodyEncoding === "base64") {
    return `${header.join("\n")}\n// Last response was binary — set variables manually.\n`;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return `${header.join("\n")}\n// Last response was not JSON.\n`;
  }

  const hits: PathHit[] = [];
  collectTokenPaths(parsed, [], hits, 0);
  if (hits.length === 0) {
    return `${header.join("\n")}\n// No token/id fields detected.\n`;
  }

  const lines = hits.map(
    (hit) => `pulse.environment.set("${hit.env}", String(${pathExpr(hit.accessors)} ?? ""));`,
  );
  return `${[...header, ...lines].join("\n")}\n`;
}

export function withDraftScripts(
  request: ApiRequest,
  patch: { tests?: string; preRequestScript?: string },
): ApiRequest {
  return {
    ...request,
    tests: patch.tests ?? request.tests,
    preRequestScript: patch.preRequestScript ?? request.preRequestScript,
  };
}
