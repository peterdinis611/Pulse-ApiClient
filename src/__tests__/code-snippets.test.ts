import { describe, expect, it } from "vitest";
import { requestToSnippet } from "@/lib/code-snippets";
import { createRequest, defaultAuth } from "@/lib/helpers";

const request = createRequest({
  method: "POST",
  url: "https://api.example.com/users",
  bodyKind: "json",
  body: '{"name":"Ada"}',
  auth: { ...defaultAuth(), authType: "bearer", bearerToken: "secret" },
});

describe("code-snippets", () => {
  it("emits fetch, axios, httpie, python, and go", () => {
    expect(requestToSnippet("fetch", request)).toContain("await fetch(");
    expect(requestToSnippet("axios", request)).toContain("axios({");
    expect(requestToSnippet("httpie", request)).toContain("http POST");
    expect(requestToSnippet("python", request)).toContain("import requests");
    expect(requestToSnippet("go", request)).toContain("http.NewRequest");
  });

  it("includes bearer auth in generated snippets", () => {
    expect(requestToSnippet("fetch", request)).toContain("Bearer secret");
    expect(requestToSnippet("python", request)).toContain("Bearer secret");
  });
});
