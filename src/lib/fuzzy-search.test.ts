import { describe, expect, it } from "vitest";
import {
  fuzzyRankIds,
  fuzzySearchDocuments,
  matchesFuzzyQuery,
  toHistoryDocument,
  toOverviewDocument,
  toSavedRequestDocument,
} from "./fuzzy-search";

describe("fuzzy-search", () => {
  const documents = [
    toOverviewDocument({
      id: "1",
      title: "Get users",
      subtitle: "https://api.example.com/users",
      method: "GET",
      meta: "Auth",
    }),
    toOverviewDocument({
      id: "2",
      title: "Create order",
      subtitle: "https://api.example.com/orders",
      method: "POST",
      meta: "Checkout",
    }),
    toOverviewDocument({
      id: "3",
      title: "Health check",
      subtitle: "https://api.example.com/health",
      method: "GET",
      meta: "Monitoring",
      status: 200,
    }),
  ];

  it("returns all ids for empty query", () => {
    expect(fuzzyRankIds(documents, "")).toEqual(["1", "2", "3"]);
  });

  it("ranks typo matches ahead of unrelated items", () => {
    const ranked = fuzzyRankIds(documents, "usrs");
    expect(ranked[0]).toBe("1");
  });

  it("matches method and path fragments", () => {
    const ranked = fuzzySearchDocuments(documents, "order");
    expect(ranked[0]?.id).toBe("2");
  });

  it("matches status keywords on overview documents", () => {
    expect(matchesFuzzyQuery(documents[2]!, "200")).toBe(true);
  });

  it("maps saved request and history documents", () => {
    const saved = toSavedRequestDocument({
      id: "saved-1",
      name: "List items",
      folder: "Catalog",
      request: { url: "https://api.example.com/items", method: "GET" },
    });
    const history = toHistoryDocument({
      id: "hist-1",
      request: { name: "Ping", url: "https://api.example.com/ping", method: "GET" },
      response: { status: 204, elapsedMs: 12 },
    });

    expect(saved.meta).toBe("Catalog");
    expect(history.keywords).toBe("204");
  });
});
