import { describe, expect, it } from "vitest";
import { curlToRequest, requestToCurl } from "@/lib/curl";
import { createRequest } from "@/lib/helpers";

describe("curl", () => {
  it("exports a GET request", () => {
    const request = createRequest({
      method: "GET",
      url: "https://api.example.com/users",
    });
    const command = requestToCurl(request);
    expect(command).toContain("https://api.example.com/users");
    expect(command).toContain("--compressed");
  });

  it("exports POST with JSON body", () => {
    const request = createRequest({
      method: "POST",
      url: "https://api.example.com/users",
      bodyKind: "json",
      body: '{"name":"Ada"}',
    });
    const command = requestToCurl(request);
    expect(command).toContain("-X POST");
    expect(command).toContain("--data-raw");
    expect(command).toContain("Ada");
  });

  it("imports a basic curl command", () => {
    const request = curlToRequest(
      `curl -X POST https://api.example.com/users -H 'Content-Type: application/json' --data-raw '{"name":"Ada"}'`,
    );
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://api.example.com/users");
    expect(request.body).toContain("Ada");
  });

  it("imports --json, -I, -G, and multipart", () => {
    const json = curlToRequest(`curl --json '{"a":1}' https://api.example.com/x`);
    expect(json.method).toBe("POST");
    expect(json.bodyKind).toBe("json");

    const head = curlToRequest(`curl -I https://api.example.com`);
    expect(head.method).toBe("HEAD");

    const get = curlToRequest(`curl -G -d 'q=pulse' https://api.example.com/search`);
    expect(get.method).toBe("GET");
    expect(get.query.some((item) => item.key === "q" && item.value === "pulse")).toBe(true);

    const multi = curlToRequest(`curl -F 'file=@photo.png;type=image/png' -F 'note=hi' https://api.example.com/up`);
    expect(multi.bodyKind).toBe("multipart");
    expect(multi.multipart).toHaveLength(2);
    expect(multi.multipart[0]?.fieldType).toBe("file");
  });

  it("imports bearer and basic auth", () => {
    const bearer = curlToRequest(`curl https://api.example.com -H 'Authorization: Bearer tok'`);
    expect(bearer.auth.authType).toBe("bearer");
    expect(bearer.auth.bearerToken).toBe("tok");

    const basic = curlToRequest(`curl -u 'ada:secret' https://api.example.com`);
    expect(basic.auth.authType).toBe("basic");
    expect(basic.auth.basicUsername).toBe("ada");
    expect(basic.auth.basicPassword).toBe("secret");
  });
});
