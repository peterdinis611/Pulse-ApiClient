import { describe, expect, it } from "vitest";
import {
  defaultWebSocketSession,
  inferProtocolFromUrl,
  isSseProtocol,
  isStreamProtocol,
  isWebSocketProtocol,
  SSE_DEFAULT_RETRY_MS,
  SSE_MAX_RECONNECT_ATTEMPTS,
  SSE_METHODS,
} from "@/lib/protocol";

describe("protocol helpers", () => {
  it("infers websocket from ws/wss urls", () => {
    expect(inferProtocolFromUrl("wss://example.com/graphql")).toBe("websocket");
    expect(inferProtocolFromUrl("ws://localhost:4000")).toBe("websocket");
    expect(inferProtocolFromUrl("https://api.example.com")).toBe("http");
  });

  it("classifies stream protocols", () => {
    expect(isWebSocketProtocol("websocket")).toBe(true);
    expect(isSseProtocol("sse")).toBe(true);
    expect(isStreamProtocol("sse")).toBe(true);
    expect(isStreamProtocol("websocket")).toBe(true);
    expect(isStreamProtocol("http")).toBe(false);
  });

  it("defaults websocket session for SSE resume fields", () => {
    const session = defaultWebSocketSession();
    expect(session.autoReconnect).toBe(true);
    expect(session.lastEventId).toBeNull();
    expect(session.lastRetryMs).toBeNull();
    expect(session.reconnectAttempts).toBe(0);
    expect(session.graphqlSubscriptionIds).toEqual([]);
  });

  it("exposes SSE reconnect defaults", () => {
    expect(SSE_DEFAULT_RETRY_MS).toBe(3000);
    expect(SSE_MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(0);
    expect(SSE_METHODS).toContain("GET");
    expect(SSE_METHODS).toContain("POST");
  });
});
