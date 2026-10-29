import { describe, expect, it, vi } from "vitest";
import {
  buildGraphqlFieldStub,
  canSendGraphqlRequest,
  formatGraphqlTypeRef,
  graphqlOperationKindForType,
  parseGraphqlResponse,
  parseGraphqlSchema,
  visibleGraphqlTypes,
} from "@/lib/graphql";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("graphql", () => {
  it("gates send with a lightweight sync check", () => {
    expect(
      canSendGraphqlRequest({
        graphqlQuery: "query { ping }",
        graphqlVariables: "{}",
      }),
    ).toBe(true);
    expect(
      canSendGraphqlRequest({
        graphqlQuery: "",
        graphqlVariables: "{}",
      }),
    ).toBe(false);
    expect(
      canSendGraphqlRequest({
        graphqlQuery: "query { ping }",
        graphqlVariables: '"bad"',
      }),
    ).toBe(false);
  });

  it("requires desktop IPC for build/format/validate", async () => {
    const { buildGraphqlBody, formatGraphqlResponse, validateGraphqlRequest } = await import(
      "@/lib/graphql"
    );
    const sample = {
      graphqlQuery: "query Example { user { id } }",
      graphqlVariables: '{"id":"abc"}',
      graphqlOperationName: "Example",
    };
    await expect(buildGraphqlBody(sample)).rejects.toThrow(/desktop/i);
    await expect(formatGraphqlResponse("{}")).rejects.toThrow(/desktop/i);
    await expect(validateGraphqlRequest(sample)).rejects.toThrow(/desktop/i);
  });

  it("parses graphql responses locally", () => {
    const raw = JSON.stringify({
      data: { user: { id: "1" } },
      errors: [{ message: "Field missing", path: ["user", "email"] }],
    });
    const parsed = parseGraphqlResponse(raw);
    expect(parsed?.data).toEqual({ user: { id: "1" } });
    expect(parseGraphqlResponse("not-json")).toBeNull();
  });

  it("parses an introspection payload", () => {
    const raw = JSON.stringify({
      data: {
        __schema: {
          queryType: { name: "Query" },
          types: [
            {
              kind: "OBJECT",
              name: "Query",
              fields: [{ name: "user", type: { kind: "OBJECT", name: "User" } }],
            },
            { kind: "OBJECT", name: "__Schema", fields: [{ name: "types" }] },
          ],
        },
      },
    });
    const schema = parseGraphqlSchema(raw);
    expect(schema?.queryType?.name).toBe("Query");
    expect(visibleGraphqlTypes(schema!).map((type) => type.name)).toEqual(["Query"]);
  });

  it("builds subscription stubs and detects operation kinds", () => {
    const schema = {
      queryType: { name: "Query" },
      mutationType: { name: "Mutation" },
      subscriptionType: { name: "Subscription" },
      types: [],
    };
    expect(graphqlOperationKindForType(schema, "Subscription")).toBe("subscription");
    expect(buildGraphqlFieldStub("query", "Query", "user")).toContain("user");
    expect(formatGraphqlTypeRef({ kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } })).toBe(
      "ID!",
    );
  });
});
