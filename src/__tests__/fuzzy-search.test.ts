import { describe, expect, it } from "vitest";
import {
  fuzzyRankIds,
  fuzzySearchDocuments,
  matchesFuzzyQuery,
  toHistoryDocument,
  toOverviewDocument,
  toSavedRequestDocument,
} from "@/lib/fuzzy-search";
import { overviewDocuments } from "./test-fixtures";

describe("fuzzy-search", () => {
  it("returns all ids for empty query", () => {
    expect(fuzzyRankIds(overviewDocuments, "")).toEqual(["1", "2", "3"]);
  });

  it("ranks typo matches ahead of unrelated items", () => {
    expect(fuzzyRankIds(overviewDocuments, "usrs")[0]).toBe("1");
  });

  it("matches method and path fragments", () => {
    expect(fuzzySearchDocuments(overviewDocuments, "order")[0]?.id).toBe("2");
  });

  it("matches status keywords on overview documents", () => {
    expect(matchesFuzzyQuery(overviewDocuments[2]!, "200")).toBe(true);
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
    expect(history.keywords).toContain("204");
    expect(history.keywords).toContain("GET");
  });

  it("maps overview documents with status keywords", () => {
    const doc = toOverviewDocument({
      id: "ov-1",
      title: "Ping",
      subtitle: "https://api.example.com/ping",
      method: "GET",
      meta: "42 ms",
      status: 404,
    });

    expect(doc.keywords).toContain("404");
    expect(doc.keywords).toContain("api.example.com");
  });
});
