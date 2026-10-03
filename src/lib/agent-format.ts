import {
  formatGraphqlResponse,
  parseGraphqlResponse,
  parseGraphqlSchema,
  visibleGraphqlTypes,
} from "@/lib/graphql";

export { formatGraphqlResponse, parseGraphqlResponse };

export function summarizeGraphqlSchemaLike(body: string): string | null {
  const schema = parseGraphqlSchema(body);
  if (!schema) return null;
  const types = visibleGraphqlTypes(schema);
  const lines = [
    "**GraphQL schema summary**",
    `- queryType: ${schema.queryType?.name ?? "—"}`,
    `- mutationType: ${schema.mutationType?.name ?? "—"}`,
    `- subscriptionType: ${schema.subscriptionType?.name ?? "—"}`,
    `- object types with fields: ${types.length}`,
    "",
  ];
  for (const type of types.slice(0, 40)) {
    const fields = (type.fields ?? []).map((field) => field.name).slice(0, 12);
    const more = (type.fields?.length ?? 0) > 12 ? "…" : "";
    lines.push(`- **${type.name}** (${type.kind ?? "OBJECT"}): ${fields.join(", ")}${more}`);
  }
  if (types.length > 40) lines.push(`…+${types.length - 40} more types`);
  return lines.join("\n");
}

export type LocalSseEvent = {
  event?: string;
  id?: string;
  retryMs?: number;
  data: string;
};

/** Minimal offline SSE parser for the in-app agent (mirrors pulse-core rules). */
export function parseSseTextLocal(text: string): LocalSseEvent[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n\r\n/g, "\n\n");
  const blocks = normalized.split("\n\n");
  const events: LocalSseEvent[] = [];
  for (const block of blocks) {
    const parsed = parseSseBlockLocal(block);
    if (parsed) events.push(parsed);
  }
  return events;
}

function parseSseBlockLocal(block: string): LocalSseEvent | null {
  let event: string | undefined;
  let id: string | undefined;
  let retryMs: number | undefined;
  const dataLines: string[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line || line.startsWith(":")) continue;
    const sep = line.indexOf(":");
    const field = sep === -1 ? line : line.slice(0, sep);
    let value = sep === -1 ? "" : line.slice(sep + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event" && value) event = value;
    else if (field === "data") dataLines.push(value);
    else if (field === "id") {
      if (value.includes("\0")) continue;
      id = value === "" ? undefined : value;
    } else if (field === "retry" && /^\d+$/.test(value)) {
      retryMs = Number(value);
    }
  }
  if (dataLines.length === 0 && id == null && retryMs == null) return null;
  return {
    event: dataLines.length === 0 ? undefined : event,
    id,
    retryMs,
    data: dataLines.join("\n"),
  };
}
