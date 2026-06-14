import type { HttpResponse } from "@/types";
import { prettyJson } from "@/lib/helpers";
import { runHttpTests } from "@/lib/http-client";
import { normalizeTestsToPulse } from "@/lib/test-snippets";

export const CONSOLE_HELP = [
  "Commands:",
  "  help              Show this help",
  "  clear             Clear the console",
  "  status            Response status code",
  "  text()            Response body text",
  "  json()            Parsed JSON body",
  "  headers           Response headers",
  '  headers.get("X")  Read a header value',
  "  time              Response time in ms",
  "  size              Response size in bytes",
  "",
  "Assertions:",
  "  pulse.test(...)   Run a Pulse test block",
  "  pulse.expect(...) Auto-wrapped in a test when needed",
  "  pulse.response... Auto-wrapped in a test when needed",
].join("\n");

export function prepareConsoleScript(input: string): string {
  const script = normalizeTestsToPulse(input).trim();
  if (!script) return "";
  if (script.startsWith("[")) return script;
  if (script.includes("pulse.test(")) return script;
  return `pulse.test("Console", function () {\n    ${script.replace(/\n/g, "\n    ")}\n});`;
}

export function tryEvalConsoleRead(input: string, response: HttpResponse): string | null {
  const trimmed = normalizeTestsToPulse(input).trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  if (lower === "help") return CONSOLE_HELP;
  if (lower === "status" || lower === "pulse.response.code") return String(response.status);
  if (lower === "status text" || lower === "pulse.response.statustext") return response.statusText;
  if (lower === "time" || lower === "pulse.response.responsetime") {
    return `${response.elapsedMs} ms`;
  }
  if (lower === "size" || lower === "pulse.response.size()") {
    return `${response.sizeBytes} bytes`;
  }
  if (lower === "text()" || lower === "pulse.response.text()") return response.body;
  if (lower === "json()" || lower === "pulse.response.json()") {
    try {
      return prettyJson(response.body);
    } catch {
      return response.body;
    }
  }
  if (lower === "headers" || lower === "pulse.response.headers") {
    if (response.headers.length === 0) return "(none)";
    return response.headers.map((header) => `${header.key}: ${header.value}`).join("\n");
  }

  const headerMatch =
    trimmed.match(/^headers\.get\(["']([^"']+)["']\)$/i) ??
    trimmed.match(/^pulse\.response\.headers\.get\(["']([^"']+)["']\)$/i);
  if (headerMatch) {
    const name = headerMatch[1];
    const header = response.headers.find(
      (item) => item.key.toLowerCase() === name.toLowerCase(),
    );
    return header?.value ?? "(not found)";
  }

  return null;
}

export function formatConsoleTestResults(
  results: Awaited<ReturnType<typeof runHttpTests>>,
): { output: string; level: "success" | "error" } {
  if (results.total === 0) {
    return {
      output: "No tests found. Type help for available commands.",
      level: "error",
    };
  }

  const lines = results.results.map((result) =>
    result.passed
      ? `✓ ${result.name}`
      : `✕ ${result.name}${result.message ? `: ${result.message}` : ""}`,
  );

  return {
    output: lines.join("\n"),
    level: results.failed > 0 ? "error" : "success",
  };
}

export async function runConsoleInput(
  input: string,
  response: HttpResponse,
): Promise<{ output: string; level: "success" | "error" | "info" }> {
  const read = tryEvalConsoleRead(input, response);
  if (read !== null) {
    return { output: read, level: "info" };
  }

  const script = prepareConsoleScript(input);
  const results = await runHttpTests(script, response);
  const formatted = formatConsoleTestResults(results);
  return { output: formatted.output, level: formatted.level };
}
