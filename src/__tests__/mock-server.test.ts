import { describe, expect, it } from "vitest";
import { mockRoutesFromCollections } from "@/lib/mock-server";
import { createRequest, createSavedRequest } from "@/lib/helpers";

describe("mock routes", () => {
  it("builds routes from saved examples", () => {
    const request = createRequest({
      method: "GET",
      url: "https://api.example.com/pets",
      examples: [
        {
          id: "ex",
          name: "ok",
          savedAt: "2026-01-01T00:00:00.000Z",
          response: {
            status: 200,
            statusText: "OK",
            headers: [],
            body: '{"ok":true}',
            elapsedMs: 1,
            sizeBytes: 11,
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
      },
    ]);
  });
});
