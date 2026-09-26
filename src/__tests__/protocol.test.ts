import { describe, expect, it } from "vitest";
import {
  inferProtocolFromUrl,
  isSseProtocol,
  isStreamProtocol,
  isWebSocketProtocol,
  SSE_METHODS,
} from "@/lib/protocol";

describe("protocol", () => {
  it("infers websocket from ws/wss URLs only", () => {
    expect(inferProtocolFromUrl("wss://api.example/ws")).toBe("websocket");
    expect(inferProtocolFromUrl("ws://localhost:4000")).toBe("websocket");
    expect(inferProtocolFromUrl("https://api.example/events")).toBe("http");
  });

  it("treats sse as a stream protocol without inferring it from the URL", () => {
    expect(isSseProtocol("sse")).toBe(true);
    expect(isStreamProtocol("sse")).toBe(true);
    expect(isWebSocketProtocol("sse")).toBe(false);
    expect(isStreamProtocol("http")).toBe(false);
  });

  it("exposes SSE_METHODS for GET/POST streams", () => {
    expect(SSE_METHODS).toEqual(["GET", "POST"]);
  });
});
