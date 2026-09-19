export function connectionInit(payload?: unknown): string {
  return JSON.stringify({ type: "connection_init", payload: payload ?? {} });
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
