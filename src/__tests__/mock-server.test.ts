import { describe, expect, it } from "vitest";
import { LOCKED_MOCK_PORT, clampMockDelayMs, mockRoutesFromCollections, startMockServer } from "@/lib/mock-server";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("mock routes", () => {
  it("locks the desktop mock to 127.0.0.1:4010", () => {
    expect(LOCKED_MOCK_PORT).toBe(4010);
  });

  it("clamps mock delay to 0..60000", () => {
    expect(clampMockDelayMs(-1)).toBe(0);
    expect(clampMockDelayMs(80)).toBe(80);
    expect(clampMockDelayMs(90_000)).toBe(60_000);
  });

  it("refuses to start outside the desktop shell", async () => {
    await expect(startMockServer([])).rejects.toThrow(/desktop-only/i);
  });

  it("skips requests that have no saved examples", () => {
    const request = createRequest({ method: "GET", url: "https://api.example.com/pets" });
    expect(mockRoutesFromCollections([createSavedRequest(request, { name: "List" })])).toEqual([]);
  });

  it("resolves templated URLs and unnamed examples", () => {
    const request = createRequest({
      method: "GET",
      url: "{{baseUrl}}/pets/:id",
      examples: [
        {
          id: "ex-ok",
          name: "  ",
          savedAt: "2026-01-01T00:00:00.000Z",
          response: {
            status: 0,
            statusText: "OK",
            headers: [{ key: "Content-Length", value: "2" }],
            body: "{}",
            elapsedMs: 1,
            sizeBytes: 2,
            contentType: "  ",
          },
        },
      ],
    });
    expect(mockRoutesFromCollections([createSavedRequest(request, { name: "Get" })])).toEqual([
      {
        method: "GET",
        path: "/pets/:id",
        status: 200,
        body: "{}",
        contentType: "",
        exampleName: "example",
        headers: [],
      },
    ]);
  });

  it("builds a route for every saved example and drops hidden headers", () => {
    const request = createRequest({
      method: "GET",
      url: "https://api.example.com/pets",
      examples: [
        {
          id: "ex-ok",
          name: "ok",
          savedAt: "2026-01-01T00:00:00.000Z",
          response: {
            status: 200,
            statusText: "OK",
            headers: [
              { key: "Cache-Control", value: "no-store" },
              { key: "X-Pulse-Hidden", value: "nope" },
              { key: "Server", value: "pulse" },
            ],
            body: '{"ok":true}',
            elapsedMs: 1,
            sizeBytes: 11,
            contentType: "application/json",
          },
        },
        {
          id: "ex-missing",
          name: "missing",
          savedAt: "2026-01-01T00:00:00.000Z",
          response: {
            status: 404,
            statusText: "Not Found",
            headers: [],
            body: '{"error":"gone"}',
            elapsedMs: 1,
            sizeBytes: 16,
            contentType: "application/json",
          },
        },
      ],
    });
    const routes = mockRoutesFromCollections([createSavedRequest(request, { name: "List" })]);
    expect(routes).toEqual([
      {
        method: "GET",
        path: "/pets",
        status: 200,
        body: '{"ok":true}',
        contentType: "application/json",
        exampleName: "ok",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        method: "GET",
        path: "/pets",
        status: 404,
        body: '{"error":"gone"}',
        contentType: "application/json",
        exampleName: "missing",
        headers: [],
      },
    ]);
  });
});
