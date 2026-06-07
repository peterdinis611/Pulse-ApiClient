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

export function defaultWebSocketSession() {
  return {
    connectionId: null,
    status: "idle" as const,
    messages: [],
    error: null,
  };
}
