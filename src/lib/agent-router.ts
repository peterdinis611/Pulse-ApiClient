/** Local intent router for the in-app Pulse agent (no LLM). Routes via pulse-core when Tauri is available. */

import { invoke } from "@tauri-apps/api/core";
import type { AgentCapability, AgentSettings } from "@/lib/agent-settings";
import { AGENT_CAPABILITIES, loadAgentSettings } from "@/lib/agent-settings";
import { t, type MessageKey } from "@/lib/i18n";
import { canUseTauriIpc } from "@/lib/tauri-runtime";

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
  | { kind: "draft_tests" }
  | { kind: "draft_pre_request" }
  | { kind: "unknown"; input: string };

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

/** Route via pulse-core (`route_agent_intent`). Desktop-only. */
export async function routeAgentInputAsync(raw: string): Promise<AgentIntent> {
  if (!canUseTauriIpc()) {
    throw new Error("Agent routing requires the desktop app");
  }
  const intent = await invoke<AgentIntent>("route_agent_intent", { input: raw });
  if (!intent?.kind) {
    return { kind: "unknown", input: raw };
  }
  return intent;
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
  offlineOnly: false,
  cloudJobs: { explain: true, unknown: true, tools: true },
});
