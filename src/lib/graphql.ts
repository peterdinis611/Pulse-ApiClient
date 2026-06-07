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
