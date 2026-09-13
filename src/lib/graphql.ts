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

export function defaultGraphqlQuery(): string {
  return `query Example {\n  __typename\n}`;
}

export function defaultGraphqlVariables(): string {
  return "{}";
}

export function buildGraphqlBody(
  request: Pick<ApiRequest, "graphqlQuery" | "graphqlVariables" | "graphqlOperationName">,
): string {
  const query = request.graphqlQuery.trim();
  const variablesRaw = request.graphqlVariables.trim() || "{}";
  const variables = JSON.parse(variablesRaw) as unknown;

  if (variables !== null && typeof variables !== "object") {
    throw new Error("GraphQL variables must be a JSON object.");
  }

  const payload: GraphqlPayload = {
    query,
    variables: (variables ?? {}) as Record<string, unknown>,
  };

  const operationName = request.graphqlOperationName.trim();
  if (operationName) {
    payload.operationName = operationName;
  }

  return JSON.stringify(payload);
}

export function validateGraphqlRequest(
  request: Pick<ApiRequest, "graphqlQuery" | "graphqlVariables" | "graphqlOperationName">,
): string | null {
  if (!request.graphqlQuery.trim()) {
    return "GraphQL query is required.";
  }

  try {
    buildGraphqlBody(request);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid GraphQL request.";
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

export function formatGraphqlResponse(body: string): string {
  const parsed = parseGraphqlResponse(body);
  if (!parsed) return body;

  const sections: string[] = [];

  if (parsed.errors?.length) {
    sections.push(
      "Errors:\n" +
        parsed.errors
          .map((error) => {
            const path = error.path?.length ? ` (path: ${error.path.join(".")})` : "";
            return `- ${error.message}${path}`;
          })
          .join("\n"),
    );
  }

  if (parsed.data !== undefined) {
    sections.push("Data:\n" + JSON.stringify(parsed.data, null, 2));
  }

  return sections.join("\n\n") || body;
}

export const GRAPHQL_INTROSPECTION_QUERY = `query PulseIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
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
  types: GraphqlType[];
};

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

