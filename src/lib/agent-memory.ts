import { invokeEffect } from "@/lib/effect/tauri";
import { runEffect } from "@/lib/effect/run";
import { canUseTauriIpc } from "@/lib/tauri-runtime";

export type AgentMemoryFact = {
  id: string;
  key: string;
  value: string;
  tags: string[];
  scope: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  note?: string | null;
};

export async function listAgentMemory(
  workspaceRoot: string,
  query?: string,
): Promise<AgentMemoryFact[]> {
  if (!canUseTauriIpc()) return [];
  return runEffect(
    invokeEffect<AgentMemoryFact[]>("agent_memory_list", {
      workspaceRoot,
      query: query ?? null,
    }),
  );
}

export async function getAgentMemory(
  workspaceRoot: string,
  key: string,
): Promise<AgentMemoryFact | null> {
  if (!canUseTauriIpc()) return null;
  return runEffect(
    invokeEffect<AgentMemoryFact | null>("agent_memory_get", { workspaceRoot, key }),
  );
}

export async function upsertAgentMemory(input: {
  workspaceRoot: string;
  key: string;
  value: string;
  scope?: "workspace" | "local";
  source?: string;
  tags?: string[];
  note?: string;
}): Promise<AgentMemoryFact> {
  return runEffect(invokeEffect<AgentMemoryFact>("agent_memory_upsert", { input }));
}

export async function deleteAgentMemory(
  workspaceRoot: string,
  key: string,
  scope?: "workspace" | "local",
): Promise<boolean> {
  return runEffect(
    invokeEffect<boolean>("agent_memory_delete", {
      workspaceRoot,
      key,
      scope: scope ?? null,
    }),
  );
}

export async function reindexAgentMemory(workspaceRoot: string): Promise<number> {
  if (!canUseTauriIpc()) return 0;
  return runEffect(invokeEffect<number>("agent_memory_reindex", { workspaceRoot }));
}

export async function clearLocalAgentMemory(workspaceRoot: string): Promise<number> {
  if (!canUseTauriIpc()) return 0;
  return runEffect(invokeEffect<number>("agent_memory_clear_local", { workspaceRoot }));
}

export function formatMemoryMarkdown(facts: AgentMemoryFact[], title: string): string {
  if (facts.length === 0) return `**${title}**\n\n_(empty)_`;
  const lines = [`**${title}** (${facts.length})`, ""];
  for (const fact of facts.slice(0, 40)) {
    const tags = fact.tags?.length ? ` · ${fact.tags.join(", ")}` : "";
    const note = fact.note ? ` — _${fact.note}_` : "";
    lines.push(`- \`${fact.key}\` = ${fact.value} \`[${fact.scope}]\`${tags}${note}`);
  }
  if (facts.length > 40) lines.push(`…+${facts.length - 40} more`);
  return lines.join("\n");
}

export function parseRememberPair(raw: string): { key: string; value: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const eq = trimmed.match(/^([^=]+)=(.+)$/);
  if (eq) {
    const key = eq[1]?.trim() ?? "";
    const value = (eq[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key && value) return { key, value };
  }
  const colon = trimmed.match(/^([^:\s]+):\s*(.+)$/);
  if (colon) {
    const key = colon[1]?.trim() ?? "";
    const value = (colon[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key && value) return { key, value };
  }
  const is = trimmed.match(/^(.+?)\s+is\s+(.+)$/i);
  if (is) {
    const key = is[1]?.trim() ?? "";
    const value = (is[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key && value) return { key, value };
  }
  return null;
}
