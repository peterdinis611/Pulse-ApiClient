const MAX_TREE_NODES = 2_000;

export type JsonTreeNode = {
  id: string;
  key: string;
  path: Array<string | number>;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  preview: string;
  value: unknown;
  children: JsonTreeNode[];
};

export function parseJsonBody(body: string): unknown | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export function jsonLeafString(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function jsonPreview(value: unknown, max = 80): string {
  const text = jsonLeafString(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function variableNameFromJsonPath(path: Array<string | number>): string {
  const named = path
    .map(String)
    .filter((segment) => segment.length > 0 && !/^\d+$/.test(segment));
  const raw = named[named.length - 1] ?? "value";
  const cleaned = raw.replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "value";
}

export function buildJsonTree(value: unknown): JsonTreeNode | null {
  if (value === undefined) return null;
  let remaining = MAX_TREE_NODES;
  const root = visit("root", [], value, () => {
    remaining -= 1;
    return remaining >= 0;
  });
  return root;
}

function visit(
  key: string,
  path: Array<string | number>,
  value: unknown,
  take: () => boolean,
): JsonTreeNode {
  const id = path.length === 0 ? "root" : path.join(".");
  if (value === null) {
    return {
      id,
      key,
      path,
      type: "null",
      preview: "null",
      value,
      children: [],
    };
  }
  if (Array.isArray(value)) {
    const children: JsonTreeNode[] = [];
    if (take()) {
      for (let index = 0; index < value.length; index += 1) {
        if (!take()) break;
        children.push(visit(String(index), [...path, index], value[index], take));
      }
    }
    return {
      id,
      key,
      path,
      type: "array",
      preview: `Array(${value.length})`,
      value,
      children,
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const children: JsonTreeNode[] = [];
    if (take()) {
      for (const [childKey, childValue] of entries) {
        if (!take()) break;
        children.push(visit(childKey, [...path, childKey], childValue, take));
      }
    }
    return {
      id,
      key,
      path,
      type: "object",
      preview: `{${entries.length}}`,
      value,
      children,
    };
  }
  if (typeof value === "string") {
    return { id, key, path, type: "string", preview: jsonPreview(value), value, children: [] };
  }
  if (typeof value === "number") {
    return { id, key, path, type: "number", preview: String(value), value, children: [] };
  }
  if (typeof value === "boolean") {
    return { id, key, path, type: "boolean", preview: String(value), value, children: [] };
  }
  return {
    id,
    key,
    path,
    type: "string",
    preview: jsonPreview(value),
    value,
    children: [],
  };
}
