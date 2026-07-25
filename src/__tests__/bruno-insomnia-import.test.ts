import { describe, expect, it } from "vitest";
import { importBrunoCollection, isBrunoCollection } from "@/lib/bruno-import";
import { importInsomniaCollection, isInsomniaExport } from "@/lib/insomnia-import";

const brunoSample = JSON.stringify({
  name: "Bruno Demo",
  version: "1",
  items: [
    {
      type: "folder",
      name: "Users",
      items: [
        {
          type: "http",
          name: "List users",
          request: {
            url: "{{baseUrl}}/users",
            method: "GET",
            headers: [{ name: "Accept", value: "application/json", enabled: true }],
            params: [{ name: "page", value: "1", type: "query", enabled: true }],
            auth: { mode: "bearer", bearer: { token: "secret" } },
            body: { mode: "none" },
          },
        },
      ],
    },
    {
      type: "http",
      name: "Create user",
      request: {
        url: "{{baseUrl}}/users",
        method: "POST",
        headers: [],
        params: [],
        auth: { mode: "none" },
        body: { mode: "json", json: '{"name":"Ada"}' },
      },
    },
  ],
});

const insomniaSample = JSON.stringify({
  _type: "export",
  __export_format: 4,
  resources: [
    { _id: "wrk_1", _type: "workspace", name: "Insomnia Demo" },
    { _id: "fld_1", _type: "request_group", parentId: "wrk_1", name: "Auth" },
    {
      _id: "req_1",
      _type: "request",
      parentId: "fld_1",
      name: "Login",
      method: "POST",
      url: "https://api.example.com/login",
      headers: [{ name: "Content-Type", value: "application/json" }],
      body: { mimeType: "application/json", text: '{"email":"a@b.c"}' },
      authentication: { type: "none" },
    },
    {
      _id: "req_2",
      _type: "request",
      parentId: "wrk_1",
      name: "Health",
      method: "GET",
      url: "https://api.example.com/health",
      authentication: { type: "bearer", token: "tok" },
    },
  ],
});

describe("bruno-import", () => {
  it("detects Bruno collections", () => {
    expect(isBrunoCollection(brunoSample)).toBe(true);
    expect(isBrunoCollection("{}")).toBe(false);
  });

  it("imports folders, auth, query, and json body", () => {
    const imported = importBrunoCollection(brunoSample);
    expect(imported.collection.source).toBe("bruno");
    expect(imported.collection.folders).toContain("Users");
    expect(imported.requests).toHaveLength(2);

    const list = imported.requests.find((item) => item.name === "List users");
    expect(list?.folder).toBe("Users");
    expect(list?.request.auth.authType).toBe("bearer");
    expect(list?.request.auth.bearerToken).toBe("secret");
    expect(list?.request.query[0]?.key).toBe("page");

    const create = imported.requests.find((item) => item.name === "Create user");
    expect(create?.request.bodyKind).toBe("json");
    expect(create?.request.body).toContain("Ada");
  });
});

describe("insomnia-import", () => {
  it("detects Insomnia exports", () => {
    expect(isInsomniaExport(insomniaSample)).toBe(true);
    expect(isInsomniaExport("{}")).toBe(false);
  });

  it("imports workspace requests with folders and auth", () => {
    const imported = importInsomniaCollection(insomniaSample);
    expect(imported.collection.source).toBe("insomnia");
    expect(imported.collection.name).toBe("Insomnia Demo");
    expect(imported.requests).toHaveLength(2);

    const login = imported.requests.find((item) => item.name === "Login");
    expect(login?.folder).toBe("Auth");
    expect(login?.request.bodyKind).toBe("json");

    const health = imported.requests.find((item) => item.name === "Health");
    expect(health?.folder).toBeUndefined();
    expect(health?.request.auth.authType).toBe("bearer");
  });
});
