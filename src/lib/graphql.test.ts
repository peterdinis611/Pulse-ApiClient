import { describe, expect, it } from "vitest";
import {
  buildGraphqlBody,
  formatGraphqlResponse,
  parseGraphqlResponse,
  validateGraphqlRequest,
} from "./graphql";

describe("graphql", () => {
  it("builds a graphql request body", () => {
    const body = buildGraphqlBody({
      graphqlQuery: "query Example { user { id } }",
      graphqlVariables: '{"id":"abc"}',
      graphqlOperationName: "Example",
    });

    expect(JSON.parse(body)).toEqual({
      query: "query Example { user { id } }",
      variables: { id: "abc" },
      operationName: "Example",
    });
  });

  it("validates missing query", () => {
    expect(
      validateGraphqlRequest({
        graphqlQuery: "",
        graphqlVariables: "{}",
        graphqlOperationName: "",
      }),
    ).toBe("GraphQL query is required.");
  });

  it("parses and formats graphql responses", () => {
    const raw = JSON.stringify({
      data: { user: { id: "1" } },
      errors: [{ message: "Field missing", path: ["user", "email"] }],
    });

    const parsed = parseGraphqlResponse(raw);
    expect(parsed?.data).toEqual({ user: { id: "1" } });
    expect(formatGraphqlResponse(raw)).toContain("Field missing");
    expect(parseGraphqlResponse("not-json")).toBeNull();
  });
});
