import { invoke } from "@tauri-apps/api/core";
import { canUseTauriIpc } from "./tauri-runtime";
import type { ApiRequest } from "@/types";

export type GraphqlPayload = {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
};

export type GraphqlError = {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
};

export type GraphqlResponse = {
  data?: unknown;
  errors?: GraphqlError[];
};

export type GraphqlTypeRef = {
  kind?: string;
  name?: string | null;
  ofType?: GraphqlTypeRef | null;
};

export type GraphqlField = {
  name: string;
  description?: string | null;
  args?: Array<{ name: string }>;
  type?: GraphqlTypeRef;
};

export type GraphqlType = {
  kind?: string;
  name?: string | null;
  description?: string | null;
  fields?: GraphqlField[] | null;
};

export type GraphqlSchema = {
  queryType?: { name?: string } | null;
  mutationType?: { name?: string } | null;
  subscriptionType?: { name?: string } | null;
  types: GraphqlType[];
};

export type GraphqlSchemaSummary = {
  queryType?: string | null;
  mutationType?: string | null;
  subscriptionType?: string | null;
  types: Array<{ kind?: string | null; name: string; fields: string[] }>;
};

export type GraphqlDocumentOperation = {
  kind: string;
  name?: string | null;
};

export type GraphqlOperationKind = "query" | "mutation" | "subscription";

function requireTauri(): void {
  if (!canUseTauriIpc()) {
    throw new Error("GraphQL helpers require the desktop app");
  }
}

export function defaultGraphqlQuery(): string {
  return `query Example {\n  __typename\n}`;
}

export function defaultGraphqlVariables(): string {
  return "{}";
}

/** Compact introspection query constant (mirrors pulse-core). Prefer `graphqlIntrospectionQuery()`. */
export const GRAPHQL_INTROSPECTION_QUERY = `query PulseIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields {
        name
        description
        args { name }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}`;

export async function graphqlIntrospectionQuery(): Promise<string> {
  requireTauri();
  return invoke<string>("graphql_introspection_query");
}

export async function buildGraphqlBody(
  request: Pick<ApiRequest, "graphqlQuery" | "graphqlVariables" | "graphqlOperationName">,
): Promise<string> {
  requireTauri();
  return invoke<string>("graphql_build_body", {
    query: request.graphqlQuery,
    variablesJson: request.graphqlVariables,
    operationName: request.graphqlOperationName || null,
  });
}

export async function validateGraphqlRequest(
  request: Pick<ApiRequest, "graphqlQuery" | "graphqlVariables" | "graphqlOperationName">,
): Promise<string | null> {
  requireTauri();
  return invoke<string | null>("graphql_validate", {
    query: request.graphqlQuery,
    variablesJson: request.graphqlVariables,
    operationName: request.graphqlOperationName || null,
  });
}

/** Lightweight sync gate for send-button enablement (full validate is IPC). */
export function canSendGraphqlRequest(
  request: Pick<ApiRequest, "graphqlQuery" | "graphqlVariables">,
): boolean {
  if (!request.graphqlQuery.trim()) return false;
  const raw = request.graphqlVariables.trim() || "{}";
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === null || typeof parsed === "object";
  } catch {
    return false;
  }
}

export function parseGraphqlResponse(body: string): GraphqlResponse | null {
  try {
    const parsed = JSON.parse(body) as GraphqlResponse;
    if (!parsed || typeof parsed !== "object") return null;
    if (!("data" in parsed) && !("errors" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function formatGraphqlResponse(body: string): Promise<string> {
  requireTauri();
  return invoke<string>("graphql_format_response", { body });
}

export async function summarizeGraphqlSchema(body: string): Promise<GraphqlSchemaSummary | null> {
  requireTauri();
  return invoke<GraphqlSchemaSummary | null>("graphql_summarize_schema", { body });
}

export async function listGraphqlOperations(document: string): Promise<GraphqlDocumentOperation[]> {
  requireTauri();
  return invoke<GraphqlDocumentOperation[]>("graphql_list_operations", { document });
}

export function parseGraphqlSchema(body: string): GraphqlSchema | null {
  const parsed = parseGraphqlResponse(body);
  const schema = (parsed?.data as { __schema?: GraphqlSchema } | undefined)?.__schema;
  if (!schema?.types) return null;
  return schema;
}

export function formatGraphqlTypeRef(type: GraphqlTypeRef | undefined): string {
  if (!type) return "";
  if (type.kind === "NON_NULL") return `${formatGraphqlTypeRef(type.ofType ?? undefined)}!`;
  if (type.kind === "LIST") return `[${formatGraphqlTypeRef(type.ofType ?? undefined)}]`;
  return type.name ?? "";
}

export function visibleGraphqlTypes(schema: GraphqlSchema): GraphqlType[] {
  return schema.types
    .filter((type) => type.name && !type.name.startsWith("__") && (type.fields?.length ?? 0) > 0)
    .sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));
}

export function graphqlOperationKindForType(
  schema: GraphqlSchema,
  typeName: string | null | undefined,
): GraphqlOperationKind {
  if (!typeName) return "query";
  if (schema.subscriptionType?.name === typeName) return "subscription";
  if (schema.mutationType?.name === typeName) return "mutation";
  return "query";
}

export function buildGraphqlFieldStub(
  operation: GraphqlOperationKind,
  operationName: string,
  fieldName: string,
): string {
  return `${operation} ${operationName} {\n  ${fieldName}\n}`;
}
