import { invokeEffect } from "@/lib/effect/tauri";
import { runEffect } from "@/lib/effect/run";
import { canUseTauriIpc } from "@/lib/tauri-runtime";

export type AgentRagHit = {
  id: string;
  kind: string;
  text: string;
  score: number;
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

export function formatRagHitsMarkdown(hits: AgentRagHit[], query: string): string {
  if (hits.length === 0) {
    return `**RAG** for “${query}”\n\n_(no matches — try reindex or a broader query)_`;
  }
  const lines = [
    `**RAG** for “${query}” (${hits.length} hit${hits.length === 1 ? "" : "s"})`,
    "",
    "_Embedding runtime: hashed n-gram TF-IDF (no PyTorch)_",
    "",
  ];
  for (const [i, hit] of hits.entries()) {
    lines.push(`${i + 1}. \`${hit.score.toFixed(3)}\` · **${hit.kind}** · ${hit.text}`);
  }
  return lines.join("\n");
}
