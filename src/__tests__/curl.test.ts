import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri-runtime", () => ({
  canUseTauriIpc: () => false,
}));

describe("curl", () => {
  it("requires desktop IPC outside Tauri", async () => {
    const { curlToRequestAsync, requestToCurlAsync } = await import("@/lib/curl");
    await expect(curlToRequestAsync("curl https://example.com")).rejects.toThrow(/desktop/i);
    await expect(
      requestToCurlAsync({
        id: "r",
        name: "x",
        protocol: "http",
        method: "GET",
        url: "https://example.com",
        headers: [],
        query: [],
        pathParams: [],
        bodyKind: "none",
        body: "",
        graphqlQuery: "",
        graphqlVariables: "{}",
        graphqlOperationName: "",
        form: [],
        multipart: [],
        auth: {
          authType: "none",
          bearerToken: "",
          basicUsername: "",
          basicPassword: "",
          apiKeyKey: "",
          apiKeyValue: "",
          apiKeyIn: "header",
          oauthGrantType: "client_credentials",
          oauthTokenUrl: "",
          oauthAuthorizeUrl: "",
          oauthClientId: "",
          oauthClientSecret: "",
          oauthScope: "",
          oauthRedirectUri: "",
          oauthRefreshToken: "",
          oauthCodeVerifier: "",
          oauthAuthCode: "",
        },
        tests: "",
        preRequestScript: "",
        responseSchema: "",
        examples: [],
      }),
    ).rejects.toThrow(/desktop/i);
  });
});
