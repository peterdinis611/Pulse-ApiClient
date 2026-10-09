import { describe, expect, it } from "vitest";
import { routeAgentInput } from "@/lib/agent-router";

describe("agent-router", () => {
  it("routes help and empty input", () => {
    expect(routeAgentInput("")).toEqual({ kind: "help" });
    expect(routeAgentInput("help")).toEqual({ kind: "help" });
    expect(routeAgentInput("?")).toEqual({ kind: "help" });
  });

  it("routes quick actions", () => {
    expect(routeAgentInput("quick:explain")).toEqual({ kind: "explain_response" });
    expect(routeAgentInput("quick:tests")).toEqual({ kind: "explain_tests" });
    expect(routeAgentInput("quick:workspace")).toEqual({ kind: "workspace_status" });
    expect(routeAgentInput("quick:history")).toEqual({ kind: "workspace_history" });
    expect(routeAgentInput("quick:run")).toEqual({ kind: "run_collection" });
  });

  it("routes natural language intents", () => {
    expect(routeAgentInput("explain last response")).toEqual({ kind: "explain_response" });
    expect(routeAgentInput("explain test failures")).toEqual({ kind: "explain_tests" });
    expect(routeAgentInput("workspace status")).toEqual({ kind: "workspace_status" });
    expect(routeAgentInput("agent history")).toEqual({ kind: "workspace_history" });
    expect(routeAgentInput("run active collection")).toEqual({ kind: "run_collection" });
    expect(routeAgentInput("graphql summarize")).toEqual({ kind: "graphql_summarize" });
  });

  it("extracts cURL from raw or fenced input", () => {
    const raw = routeAgentInput('curl -X GET "https://api.example.com/v1"');
    expect(raw.kind).toBe("import_curl");
    if (raw.kind === "import_curl") {
      expect(raw.curl).toContain("curl");
      expect(raw.curl).toContain("api.example.com");
    }

    const fenced = routeAgentInput("```bash\ncurl https://example.com\n```");
    expect(fenced.kind).toBe("import_curl");
    if (fenced.kind === "import_curl") {
      expect(fenced.curl).toContain("curl https://example.com");
    }
  });

  it("asks for cURL when import is requested without a command", () => {
    const result = routeAgentInput("import curl");
    expect(result.kind).toBe("unknown");
  });

  it("parses SSE documents", () => {
    const doc = "event: ping\ndata: hi\n\n";
    const result = routeAgentInput(doc);
    expect(result.kind).toBe("sse_parse");
    if (result.kind === "sse_parse") {
      expect(result.text).toContain("data: hi");
    }
  });

  it("returns unknown for unrecognized input", () => {
    const result = routeAgentInput("write me a poem about APIs");
    expect(result).toEqual({ kind: "unknown", input: "write me a poem about APIs" });
  });

  it("routes memory intents", () => {
    expect(routeAgentInput("list memory")).toEqual({ kind: "memory_list" });
    expect(routeAgentInput("quick:memory")).toEqual({ kind: "memory_list" });
    expect(routeAgentInput("remember env=staging")).toEqual({
      kind: "remember",
      key: "env",
      value: "staging",
      scope: "workspace",
    });
    expect(routeAgentInput("remember secret=x --local")).toEqual({
      kind: "remember",
      key: "secret",
      value: "x",
      scope: "local",
    });
    expect(routeAgentInput("recall env")).toEqual({ kind: "recall", query: "env" });
    expect(routeAgentInput("forget env")).toEqual({ kind: "forget", key: "env" });
  });

  it("routes RAG intents", () => {
    expect(routeAgentInput("quick:rag")).toEqual({ kind: "rag_reindex" });
    expect(routeAgentInput("reindex rag")).toEqual({ kind: "rag_reindex" });
    expect(routeAgentInput("search history users list")).toEqual({
      kind: "rag_search",
      query: "users list",
    });
    expect(routeAgentInput("rag oauth token")).toEqual({
      kind: "rag_search",
      query: "oauth token",
    });
  });
});
