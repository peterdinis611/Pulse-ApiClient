import { describe, expect, it } from "vitest";
import {
  buildGraphqlBody,
  formatGraphqlResponse,
  parseGraphqlResponse,
  validateGraphqlRequest,
} from "@/lib/graphql";

const sampleRequest = {
  graphqlQuery: "query Example { user { id } }",
  graphqlVariables: '{"id":"abc"}',
  graphqlOperationName: "Example",
};

describe("graphql", () => {
  it("builds a graphql request body", () => {
    expect(JSON.parse(buildGraphqlBody(sampleRequest))).toEqual({
      query: "query Example { user { id } }",
      variables: { id: "abc" },
      operationName: "Example",
    });
  });

  it("omits operationName when empty", () => {
    const body = JSON.parse(
      buildGraphqlBody({ ...sampleRequest, graphqlOperationName: "" }),
    );
    expect(body).not.toHaveProperty("operationName");
  });

  it.each([
    [{ ...sampleRequest, graphqlQuery: "" }, "GraphQL query is required."],
    [{ ...sampleRequest, graphqlVariables: '"bad"' }, "GraphQL variables must be a JSON object."],
  ] as const)("validateGraphqlRequest rejects invalid input", (request, message) => {
    expect(validateGraphqlRequest(request)).toBe(message);
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
