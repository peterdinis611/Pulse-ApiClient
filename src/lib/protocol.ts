import type { RequestProtocol } from "@/types";

export function inferProtocolFromUrl(url: string): RequestProtocol {
  const normalized = url.trim().toLowerCase();
  if (normalized.startsWith("ws://") || normalized.startsWith("wss://")) {
    return "websocket";
  }
  return "http";
}

export function isWebSocketProtocol(protocol: RequestProtocol): boolean {
  return protocol === "websocket";
}

export function isSseProtocol(protocol: RequestProtocol): boolean {
  return protocol === "sse";
}

export function isStreamProtocol(protocol: RequestProtocol): boolean {
  return protocol === "websocket" || protocol === "sse";
}

export function defaultWebSocketSession() {
  return {
    connectionId: null,
    status: "idle" as const,
    messages: [],
    error: null,
    lastEventId: null as string | null,
    lastRetryMs: null as number | null,
    subprotocol: null as string | null,
    graphqlAcked: false,
    graphqlSubscriptionIds: [] as string[],
  };
}

/** Methods commonly used for SSE (GET stream, POST for AI/chat streams). */
export const SSE_METHODS = ["GET", "POST"] as const;
