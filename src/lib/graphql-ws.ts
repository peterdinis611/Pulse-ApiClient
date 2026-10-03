export function connectionInit(payload?: unknown): string {
  return JSON.stringify({
    type: "connection_init",
    ...(payload !== undefined ? { payload } : { payload: {} }),
  });
}

/** Map Pulse auth fields into a graphql-ws connection_init payload. */
export function connectionInitPayloadFromAuth(auth: {
  authType: string;
  bearerToken?: string;
  apiKeyKey?: string;
  apiKeyValue?: string;
  apiKeyIn?: string;
}): Record<string, string> | undefined {
  if (auth.authType === "bearer" || auth.authType === "oauth2") {
    const token = auth.bearerToken?.trim();
    if (token) return { Authorization: `Bearer ${token}` };
  }
  if (auth.authType === "apiKey") {
    const key = auth.apiKeyKey?.trim();
    if (key && auth.apiKeyIn !== "query") {
      return { [key]: auth.apiKeyValue ?? "" };
    }
  }
  return undefined;
}

export function graphqlSubscribe(
  id: string,
  query: string,
  variables?: unknown,
  operationName?: string,
): string {
  const payload: Record<string, unknown> = { query };
  if (variables != null) payload.variables = variables;
  if (operationName) payload.operationName = operationName;
  return JSON.stringify({ type: "subscribe", id, payload });
}

export function graphqlComplete(id: string): string {
  return JSON.stringify({ type: "complete", id });
}

export function graphqlPong(payload?: unknown): string {
  return JSON.stringify({
    type: "pong",
    ...(payload !== undefined ? { payload } : {}),
  });
}

export function parseGraphqlWsFrame(
  data: string,
): { type: string; id?: string; payload?: unknown } | null {
  try {
    const parsed = JSON.parse(data) as { type?: unknown; id?: unknown; payload?: unknown };
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }
    return {
      type: parsed.type,
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      payload: parsed.payload,
    };
  } catch {
    return null;
  }
}
