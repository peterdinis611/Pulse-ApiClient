import { describe, expect, it } from "vitest";
import {
  connectionInit,
  connectionInitPayloadFromAuth,
  graphqlComplete,
  graphqlSubscribe,
  parseGraphqlWsFrame,
} from "@/lib/graphql-ws";

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

  it("maps bearer auth into connection_init payload", () => {
    expect(
      connectionInitPayloadFromAuth({
        authType: "bearer",
        bearerToken: "secret",
      }),
    ).toEqual({ Authorization: "Bearer secret" });
  });

  it("parses graphql-ws frames", () => {
    expect(parseGraphqlWsFrame('{"type":"connection_ack"}')).toEqual({
      type: "connection_ack",
      id: undefined,
      payload: undefined,
    });
    expect(parseGraphqlWsFrame("not-json")).toBeNull();
  });
});
