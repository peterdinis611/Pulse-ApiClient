/** Local intent router for the in-app Pulse agent (no LLM). */

import { parseRememberPair } from "@/lib/agent-memory";
import type { AgentCapability, AgentSettings } from "@/lib/agent-settings";
import { AGENT_CAPABILITIES, loadAgentSettings } from "@/lib/agent-settings";

export type AgentIntent =
  | { kind: "help" }
  | { kind: "import_curl"; curl: string }
  | { kind: "explain_response" }
  | { kind: "explain_tests" }
  | { kind: "workspace_status" }
  | { kind: "workspace_history" }
  | { kind: "run_collection" }
  | { kind: "graphql_summarize" }
  | { kind: "sse_parse"; text: string }
  | { kind: "remember"; key: string; value: string; scope: "workspace" | "local" }
  | { kind: "recall"; query: string }
  | { kind: "forget"; key: string }
  | { kind: "memory_list" }
  | { kind: "unknown"; input: string };

const CURL_BLOCK = /```(?:bash|sh|shell|zsh)?\s*([\s\S]*?curl[\s\S]*?)```/i;
const CURL_LINE = /((?:^|\n)\s*curl\b[\s\S]+)/i;

function extractCurl(input: string): string | null {
  const fenced = input.match(CURL_BLOCK);
  if (fenced?.[1]?.toLowerCase().includes("curl")) {
    return fenced[1].trim();
  }
  const loose = input.match(CURL_LINE);
  if (loose?.[1]) {
    return loose[1].trim();
  }
  if (input.trim().toLowerCase().startsWith("curl ")) {
    return input.trim();
  }
  return null;
}

function extractSseDoc(input: string): string | null {
  const fenced = input.match(/```(?:sse|text)?\s*([\s\S]*?)```/i);
  if (fenced?.[1] && /(?:^|\n)\s*(?:data|event|id|retry):/i.test(fenced[1])) {
    return fenced[1].trim();
  }
  // After trim(), trailing blank lines are gone — accept multi-line SSE field docs.
  if (
    /(?:^|\n)\s*(?:data|event|id|retry):/im.test(input) &&
    (input.includes("\n\n") || /\n\s*(?:data|event|id|retry):/im.test(input))
  ) {
    return input.trim();
  }
  return null;
}

/** Map a user utterance (or quick-action id) to a structured intent. */
export function routeAgentInput(raw: string): AgentIntent {
  const input = raw.trim();
  if (!input) return { kind: "help" };

  const quick = input.toLowerCase();
  if (quick === "help" || quick === "?" || quick === "quick:help") {
    return { kind: "help" };
  }
  if (quick === "quick:explain" || quick === "explain response" || /explain\s+(last\s+)?response/.test(quick)) {
    return { kind: "explain_response" };
  }
  if (
    quick === "quick:tests" ||
    /explain\s+(test|tests|failures)/.test(quick) ||
    /test\s+failures/.test(quick)
  ) {
    return { kind: "explain_tests" };
  }
  if (
    quick === "quick:workspace" ||
    /workspace\s+status/.test(quick) ||
    /pending\s+mutations?/.test(quick) ||
    quick === "status"
  ) {
    return { kind: "workspace_status" };
  }
  if (
    quick === "quick:history" ||
    /agent\s+history/.test(quick) ||
    /workspace\s+history/.test(quick)
  ) {
    return { kind: "workspace_history" };
  }
  if (
    quick === "quick:run" ||
    /^run\s+(active\s+)?collection/.test(quick) ||
    /^run\s+collection/.test(quick)
  ) {
    return { kind: "run_collection" };
  }
  if (/graphql\s+(summarize|schema|introspect)/.test(quick) || quick === "summarize schema") {
    return { kind: "graphql_summarize" };
  }
  if (
    quick === "quick:memory" ||
    quick === "list memory" ||
    quick === "memory list" ||
    quick === "show memory"
  ) {
    return { kind: "memory_list" };
  }
  if (/^remember\s+/.test(quick)) {
    const rest = input.replace(/^remember\s+/i, "").trim();
    let scope: "workspace" | "local" = "workspace";
    const body = rest
      .split(/\s+/)
      .filter((part) => {
        const p = part.toLowerCase();
        if (p === "--local" || p === "--scope=local" || p === "scope=local") {
          scope = "local";
          return false;
        }
        return true;
      })
      .join(" ");
    const pair = parseRememberPair(body);
    if (pair) return { kind: "remember", key: pair.key, value: pair.value, scope };
    return { kind: "unknown", input: "Usage: remember key=value  (optional --local)" };
  }
  if (/^(?:recall|what\s+do\s+you\s+remember\s+about)\s+/.test(quick)) {
    const query = input
      .replace(/^(?:recall|what\s+do\s+you\s+remember\s+about)\s+/i, "")
      .trim();
    return { kind: "recall", query };
  }
  if (/^forget\s+/.test(quick)) {
    return { kind: "forget", key: input.replace(/^forget\s+/i, "").trim() };
  }

  const curl = extractCurl(input);
  if (curl || quick === "quick:curl" || /import\s+curl/.test(quick)) {
    if (curl) return { kind: "import_curl", curl };
    return { kind: "unknown", input: "Paste a cURL command (or wrap it in a ```bash fence)." };
  }

  const sse = extractSseDoc(input);
  if (sse || /parse\s+sse/.test(quick)) {
    if (sse) return { kind: "sse_parse", text: sse };
    return { kind: "unknown", input: "Paste an SSE document to parse (event/data blocks)." };
  }

  return { kind: "unknown", input };
}

const HELP_LINES: Record<AgentCapability, string> = {
  import_curl: "• **Import cURL** — paste a curl command → opens a request tab",
  explain_response: "• **Explain last response** — summarize status, body, GraphQL errors",
  explain_tests: "• **Explain test failures** — walk the last test run",
  workspace_status: "• **Workspace status** — Git workspace root + pending mutations",
  workspace_history:
    "• **Agent history** — recent agent/MCP history from `.pulse/history.jsonl`",
  run_collection: "• **Run active collection** — needs confirm (mutating requests)",
  graphql_summarize:
    "• **GraphQL summarize** — summarize introspection body on the active tab",
  sse_parse: "• **Parse SSE** — paste an SSE document",
  memory:
    "• **Memory** — `remember key=value`, `recall key`, `forget key`, `list memory`",
};

export function buildAgentHelpText(settings: AgentSettings = loadAgentSettings()): string {
  if (!settings.enabled) {
    return "The in-app agent is **turned off**. Enable it in **Settings → Agent / LLM**.";
  }
  const lines = AGENT_CAPABILITIES.filter((id) => settings.capabilities[id]).map(
    (id) => HELP_LINES[id],
  );
  if (lines.length === 0) {
    return "The agent is on, but every capability is disabled. Expand capabilities in **Settings → Agent / LLM**.";
  }
  return [
    "I understand these intents (local, no LLM yet):",
    "",
    ...lines,
    "",
    "Or use the quick-action chips below.",
  ].join("\n");
}

/** @deprecated Prefer buildAgentHelpText() so disabled capabilities stay hidden. */
export const AGENT_HELP_TEXT = buildAgentHelpText({
  enabled: true,
  capabilities: Object.fromEntries(AGENT_CAPABILITIES.map((id) => [id, true])) as Record<
    AgentCapability,
    boolean
  >,
  provider: "none",
  apiKey: "",
});
