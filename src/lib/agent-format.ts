import {
  formatGraphqlResponse,
  parseGraphqlResponse,
  summarizeGraphqlSchema,
  type GraphqlSchemaSummary,
} from "@/lib/graphql";
import { invoke } from "@tauri-apps/api/core";
import { canUseTauriIpc } from "@/lib/tauri-runtime";

export { formatGraphqlResponse, parseGraphqlResponse };

export type LocalSseEvent = {
  event?: string;
  id?: string;
  retryMs?: number;
  data: string;
};

function formatSchemaSummaryMarkdown(summary: GraphqlSchemaSummary): string {
  const types = summary.types ?? [];
  const lines = [
    "**GraphQL schema summary**",
    `- queryType: ${summary.queryType ?? "—"}`,
    `- mutationType: ${summary.mutationType ?? "—"}`,
    `- subscriptionType: ${summary.subscriptionType ?? "—"}`,
    `- object types with fields: ${types.length}`,
    "",
  ];
  for (const type of types.slice(0, 40)) {
    const fields = (type.fields ?? []).slice(0, 12);
    const more = (type.fields?.length ?? 0) > 12 ? "…" : "";
    lines.push(`- **${type.name}** (${type.kind ?? "OBJECT"}): ${fields.join(", ")}${more}`);
  }
  if (types.length > 40) lines.push(`…+${types.length - 40} more types`);
  return lines.join("\n");
}

/** Summarize introspection JSON via pulse-core, formatted as markdown for the agent. */
export async function summarizeGraphqlSchemaLike(body: string): Promise<string | null> {
  const summary = await summarizeGraphqlSchema(body);
  if (!summary) return null;
  return formatSchemaSummaryMarkdown(summary);
}

/** Parse SSE text via pulse-core (`parse_sse_text`). */
export async function parseSseTextLocal(text: string): Promise<LocalSseEvent[]> {
  if (!canUseTauriIpc()) {
    throw new Error("SSE parse requires the desktop app");
  }
  return invoke<LocalSseEvent[]>("parse_sse_text", { text });
}
