import { describe, expect, it } from "vitest";
import { mockRoutesFromCollections } from "@/lib/mock-server";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("mock routes", () => {
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
