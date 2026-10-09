/** Local intent router for the in-app Pulse agent (no LLM). */

import { parseRememberPair } from "@/lib/agent-memory";
import type { AgentCapability, AgentSettings } from "@/lib/agent-settings";
import { AGENT_CAPABILITIES, loadAgentSettings } from "@/lib/agent-settings";
import { t, type MessageKey } from "@/lib/i18n";

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
  | { kind: "rag_search"; query: string }
  | { kind: "rag_reindex" }
  | { kind: "unknown"; input: string };

const CURL_BLOCK = /```(?:bash|sh|shell|zsh)?\s*([\s\S]*?curl[\s\S]*?)```/i;
const CURL_LINE = /((?:^|\n)\s*curl\b[\s\S]+)/i;

const HELP_KEYS: Record<AgentCapability, MessageKey> = {
  import_curl: "agent.md.cap.import_curl",
  explain_response: "agent.md.cap.explain_response",
  explain_tests: "agent.md.cap.explain_tests",
  workspace_status: "agent.md.cap.workspace_status",
  workspace_history: "agent.md.cap.workspace_history",
  run_collection: "agent.md.cap.run_collection",
  graphql_summarize: "agent.md.cap.graphql_summarize",
  sse_parse: "agent.md.cap.sse_parse",
  memory: "agent.md.cap.memory",
  memory_rag: "agent.md.cap.memory_rag",
};

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
  if (
    quick === "quick:rag" ||
    quick === "reindex rag" ||
    quick === "rag reindex" ||
    quick === "rebuild rag"
  ) {
    return { kind: "rag_reindex" };
  }
  const ragMatch = quick.match(
    /^(?:rag|search\s+history|find\s+in\s+history|search\s+memory)\s+(.+)$/,
  );
  if (ragMatch?.[1]) {
    return { kind: "rag_search", query: ragMatch[1].trim() };
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
    return { kind: "unknown", input: t("agent.md.usageRemember") };
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
    return { kind: "unknown", input: t("agent.md.pasteCurl") };
  }

  const sse = extractSseDoc(input);
  if (sse || /parse\s+sse/.test(quick)) {
    if (sse) return { kind: "sse_parse", text: sse };
    return { kind: "unknown", input: t("agent.md.pasteSse") };
  }

  return { kind: "unknown", input };
}

export function buildAgentHelpText(settings: AgentSettings = loadAgentSettings()): string {
  if (!settings.enabled) {
    return t("agent.md.helpOff");
  }
  const lines = AGENT_CAPABILITIES.filter((id) => settings.capabilities[id]).map(
    (id) => t(HELP_KEYS[id]),
  );
  if (lines.length === 0) {
    return t("agent.md.helpNone");
  }
  return [t("agent.md.helpIntro"), "", ...lines, "", t("agent.md.helpFooter")].join("\n");
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
