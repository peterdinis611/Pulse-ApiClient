import { describe, expect, it } from "vitest";
import { curlToRequest, requestToCurl } from "../curl";
import { createRequest } from "../helpers";

describe("curl", () => {
  it("exports a GET request", () => {
    const request = createRequest({
      method: "GET",
      url: "https://api.example.com/users",
    });
    expect(requestToCurl(request)).toContain("https://api.example.com/users");
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
});
