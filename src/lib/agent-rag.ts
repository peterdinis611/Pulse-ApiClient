import { invokeEffect } from "@/lib/effect/tauri";
import { runEffect } from "@/lib/effect/run";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { createRequest } from "@/lib/helpers";
import { t } from "@/lib/i18n";

export type AgentRagHit = {
  id: string;
  kind: string;
  text: string;
  score: number;
  method?: string | null;
  url?: string | null;
  name?: string | null;
  status?: number | null;
  historyId?: string | null;
};

export type AgentRagCitation = {
  id: string;
  label: string;
  request: ReturnType<typeof createRequest>;
};

export async function searchAgentRag(
  workspaceRoot: string,
  query: string,
  limit = 8,
): Promise<AgentRagHit[]> {
  if (!canUseTauriIpc()) return [];
  return runEffect(
    invokeEffect<AgentRagHit[]>("agent_rag_search", {
      workspaceRoot,
      query,
      limit,
    }),
  );
}

export async function searchAgentRagMarkdown(
  workspaceRoot: string,
  query: string,
  limit = 8,
): Promise<string> {
  if (!canUseTauriIpc()) {
    return `**RAG** for “${query}”\n\n_(desktop IPC unavailable)_`;
  }
  return runEffect(
    invokeEffect<string>("agent_rag_search_markdown", {
      workspaceRoot,
      query,
      limit,
    }),
  );
}

export async function reindexAgentRag(workspaceRoot: string): Promise<number> {
  if (!canUseTauriIpc()) return 0;
  return runEffect(invokeEffect<number>("agent_rag_reindex", { workspaceRoot }));
}

export async function pruneAgentRag(
  workspaceRoot: string,
  olderThanDays = 30,
  maxDocs = 5000,
): Promise<number> {
  if (!canUseTauriIpc()) return 0;
  return runEffect(
    invokeEffect<number>("agent_rag_prune", {
      workspaceRoot,
      olderThanDays,
      maxDocs,
    }),
  );
}

export function formatRagHitsMarkdown(hits: AgentRagHit[], query: string): string {
  if (hits.length === 0) {
    return t("agent.md.ragNoHits", { query });
  }
  const plural = hits.length === 1 ? "" : "s";
  const lines = [
    t("agent.md.ragHits", { query, count: hits.length, plural }),
    "",
    t("agent.md.ragRuntime"),
    "",
  ];
  for (const [i, hit] of hits.entries()) {
    const preview = hit.text.length > 160 ? `${hit.text.slice(0, 160)}…` : hit.text;
    lines.push(`${i + 1}. \`${hit.score.toFixed(3)}\` · **${hit.kind}** · ${preview} \`[${hit.id}]\``);
  }
  return lines.join("\n");
}

export function formatRagContextBlock(hits: AgentRagHit[]): string {
  if (hits.length === 0) return "";
  const plural = hits.length === 1 ? "" : "s";
  const lines = [
    "",
    "---",
    t("agent.md.ragContext", { count: hits.length, plural }),
    "",
  ];
  for (const hit of hits.slice(0, 5)) {
    const preview = hit.text.length > 120 ? `${hit.text.slice(0, 120)}…` : hit.text;
    lines.push(`- \`${hit.score.toFixed(2)}\` · **${hit.kind}** · ${preview} \`[${hit.id}]\``);
  }
  return lines.join("\n");
}

export function citationsFromRagHits(hits: AgentRagHit[]): AgentRagCitation[] {
  const out: AgentRagCitation[] = [];
  for (const hit of hits) {
    const url = hit.url?.trim();
    const method = (hit.method || "GET").toUpperCase();
    if (!url) continue;
    const name = hit.name?.trim() || `${method} ${url}`;
    out.push({
      id: hit.id,
      label: `${method} ${name}`.slice(0, 80),
      request: createRequest({
        method,
        url,
        name,
      }),
    });
  }
  return out.slice(0, 5);
}
