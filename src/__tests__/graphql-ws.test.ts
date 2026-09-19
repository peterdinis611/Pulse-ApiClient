import { describe, expect, it } from "vitest";
import { connectionInit, graphqlComplete, graphqlSubscribe } from "@/lib/graphql-ws";

describe("graphql-ws frames", () => {
  it("builds subscribe and complete messages", () => {
    const subscribe = JSON.parse(graphqlSubscribe("1", "subscription { ping }", { a: 1 }, "Ping"));
    expect(subscribe).toEqual({
      type: "subscribe",
      id: "1",
      payload: { query: "subscription { ping }", variables: { a: 1 }, operationName: "Ping" },
    });
    expect(JSON.parse(graphqlComplete("1"))).toEqual({ type: "complete", id: "1" });
    expect(JSON.parse(connectionInit()).type).toBe("connection_init");
  });
});
