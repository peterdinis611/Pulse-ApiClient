import { curlToRequestAsync } from "@/lib/curl";
import { formatGraphqlResponse, parseGraphqlResponse, summarizeGraphqlSchemaLike } from "@/lib/agent-format";
import { runCollectionAuto, type CollectionRunResult } from "@/lib/collection-runner";
import {
  appendGitAgentHistory,
  getGitWorkspaceRoot,
  listGitAgentHistory,
  listGitPending,
} from "@/lib/git-workspace";
import type { AgentIntent } from "@/lib/agent-router";
import { AGENT_HELP_TEXT } from "@/lib/agent-router";
import type {
  ApiRequest,
  CollectionGroup,
  Environment,
  HttpResponse,
  MainView,
  SavedRequest,
  TestRunResult,
} from "@/types";

export type AgentActionContext = {
  activeRequest: ApiRequest | null;
  activeResponse: HttpResponse | null;
  testResults: TestRunResult | null;
  activeCollectionId: string | null;
  collectionGroups: CollectionGroup[];
  collections: SavedRequest[];
  environment: Environment | null;
  openRequestTab: (request: ApiRequest) => void;
  setMainView: (view: MainView) => void;
};

export type AgentConfirmKind = "run_collection";

export type AgentActionResult = {
  markdown: string;
  /** When set, UI should show Confirm before calling `confirmAgentAction`. */
  needsConfirm?: AgentConfirmKind;
  openRequest?: ApiRequest;
  meta?: Record<string, unknown>;
};

function collectionRequests(
  collectionId: string | null,
  collections: SavedRequest[],
): SavedRequest[] {
  if (!collectionId) return [];
  return collections.filter((item) => item.collectionId === collectionId);
}

async function recordAgentHistory(
  kind: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const root = getGitWorkspaceRoot();
  if (!root) return;
  await appendGitAgentHistory(root, {
    id: `hist_agent_${Date.now()}`,
    sentAt: new Date().toISOString(),
    source: "in-app-agent",
    kind,
    ...meta,
  }).catch(() => undefined);
}

function summarizeHttpResponse(response: HttpResponse): string {
  const lines = [
    `**Status:** ${response.status} ${response.statusText || ""}`.trim(),
    `**Time:** ${response.elapsedMs ?? "—"} ms · **Size:** ${response.sizeBytes ?? "—"} B`,
  ];
  if (response.fromCache) lines.push("**Cache:** hit");
  const gql = parseGraphqlResponse(response.body);
  if (gql) {
    lines.push("");
    lines.push(formatGraphqlResponse(response.body));
  } else {
    const body = response.body?.trim() ?? "";
    const preview = body.length > 1200 ? `${body.slice(0, 1200)}\n…` : body;
    lines.push("");
    lines.push("**Body preview:**");
    lines.push("```");
    lines.push(preview || "(empty)");
    lines.push("```");
  }
  return lines.join("\n");
}

function explainTests(results: TestRunResult): string {
  const failed = results.results.filter((item) => !item.passed);
  const lines = [
    `**Tests:** ${results.passed} passed · ${results.failed} failed · ${results.total} total`,
  ];
  if (failed.length === 0) {
    lines.push("All assertions passed.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("**Failures:**");
  for (const item of failed.slice(0, 20)) {
    lines.push(`- ${item.name}${item.message ? `: ${item.message}` : ""}`);
  }
  if (failed.length > 20) lines.push(`…and ${failed.length - 20} more`);
  return lines.join("\n");
}

export async function runAgentIntent(
  intent: AgentIntent,
  ctx: AgentActionContext,
): Promise<AgentActionResult> {
  switch (intent.kind) {
    case "help":
      return { markdown: AGENT_HELP_TEXT };
    case "unknown":
      return {
        markdown: `${intent.input}\n\n---\n${AGENT_HELP_TEXT}`,
      };
    case "import_curl": {
      try {
        const request = await curlToRequestAsync(intent.curl);
        await recordAgentHistory("import_curl", {
          request: { method: request.method, url: request.url },
        });
        return {
          markdown: `Parsed **${request.method}** \`${request.url}\`.\n\nOpen it as a new request tab?`,
          openRequest: request,
        };
      } catch (error) {
        return {
          markdown: `Could not parse cURL: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    case "explain_response": {
      if (!ctx.activeResponse) {
        return { markdown: "No response on the active tab yet. Send a request first." };
      }
      await recordAgentHistory("explain_response", {
        response: { status: ctx.activeResponse.status },
      });
      return { markdown: summarizeHttpResponse(ctx.activeResponse) };
    }
    case "explain_tests": {
      if (!ctx.testResults) {
        return { markdown: "No test results on the active tab. Run tests after a response." };
      }
      await recordAgentHistory("explain_tests", {
        passed: ctx.testResults.passed,
        failed: ctx.testResults.failed,
      });
      return { markdown: explainTests(ctx.testResults) };
    }
    case "workspace_status": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return {
          markdown:
            "No Git workspace attached. Set one in **Settings → Data & storage** (collections folder).",
        };
      }
      try {
        const pending = await listGitPending(root);
        const history = await listGitAgentHistory(root);
        await recordAgentHistory("workspace_status", {
          pendingCount: pending.length,
          historyCount: history.length,
        });
        return {
          markdown: [
            `**Workspace:** \`${root}\``,
            `**Pending mutations:** ${pending.length}`,
            ...(pending.slice(0, 12).map((item) => `- \`${item}\``) || []),
            pending.length > 12 ? `…+${pending.length - 12} more` : "",
            `**Agent history entries:** ${history.length}`,
          ]
            .filter(Boolean)
            .join("\n"),
          meta: { root, pendingCount: pending.length, historyCount: history.length },
        };
      } catch (error) {
        return {
          markdown: `Workspace status failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    case "workspace_history": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: "No Git workspace attached — cannot read `.pulse/history.jsonl`." };
      }
      try {
        const history = await listGitAgentHistory(root);
        const recent = history.slice(-15).reverse();
        if (recent.length === 0) {
          return { markdown: "Agent history is empty." };
        }
        const lines = ["**Recent agent history** (newest first):", ""];
        for (const entry of recent) {
          const row = entry as Record<string, unknown>;
          const source = String(row.source ?? "agent");
          const sentAt = String(row.sentAt ?? row.id ?? "");
          const method = (row.request as { method?: string } | undefined)?.method;
          const url = (row.request as { url?: string } | undefined)?.url;
          const status = (row.response as { status?: number } | undefined)?.status;
          lines.push(
            `- \`${source}\` ${sentAt}${method ? ` · ${method}` : ""}${url ? ` ${url}` : ""}${
              status != null ? ` → ${status}` : ""
            }`,
          );
        }
        return { markdown: lines.join("\n"), meta: { count: history.length } };
      } catch (error) {
        return {
          markdown: `History read failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    case "run_collection": {
      const collectionId = ctx.activeCollectionId;
      const group = ctx.collectionGroups.find((item) => item.id === collectionId);
      const requests = collectionRequests(collectionId, ctx.collections);
      if (!collectionId || !group || requests.length === 0) {
        return {
          markdown:
            "No active collection with saved requests. Select a collection in the explorer first.",
        };
      }
      return {
        markdown: `Ready to run **${group.name}** (${requests.length} requests). Mutating methods may hit your API — confirm to proceed.`,
        needsConfirm: "run_collection",
        meta: { collectionId, collectionName: group.name, count: requests.length },
      };
    }
    case "graphql_summarize": {
      const body = ctx.activeResponse?.body;
      if (!body?.trim()) {
        return {
          markdown:
            "No response body to summarize. Send an introspection query (or any GraphQL response) first.",
        };
      }
      const summary = summarizeGraphqlSchemaLike(body);
      if (!summary) {
        return {
          markdown:
            "Body is not a GraphQL introspection payload. Tip: use Docs / GraphQL explorer introspect, then ask again.",
        };
      }
      await recordAgentHistory("graphql_summarize");
      return { markdown: summary };
    }
    case "sse_parse": {
      const { parseSseTextLocal } = await import("@/lib/agent-format");
      const events = parseSseTextLocal(intent.text);
      if (events.length === 0) {
        return { markdown: "No SSE events found in the pasted document." };
      }
      await recordAgentHistory("sse_parse", { count: events.length });
      const lines = [`**Parsed ${events.length} SSE event(s):**`, ""];
      for (const [index, event] of events.slice(0, 30).entries()) {
        const bits = [
          event.event ? `event=${event.event}` : null,
          event.id ? `id=${event.id}` : null,
          event.retryMs != null ? `retry=${event.retryMs}` : null,
        ].filter(Boolean);
        lines.push(`${index + 1}. ${bits.join(" · ") || "message"}`);
        lines.push("```");
        lines.push(event.data || "(empty data)");
        lines.push("```");
      }
      if (events.length > 30) lines.push(`…+${events.length - 30} more`);
      return { markdown: lines.join("\n") };
    }
    default:
      return { markdown: AGENT_HELP_TEXT };
  }
}

export async function confirmAgentAction(
  kind: AgentConfirmKind,
  ctx: AgentActionContext,
): Promise<AgentActionResult> {
  if (kind === "run_collection") {
    const collectionId = ctx.activeCollectionId;
    const group = ctx.collectionGroups.find((item) => item.id === collectionId);
    const saved = collectionRequests(collectionId, ctx.collections);
    if (!collectionId || !group || saved.length === 0) {
      return { markdown: "Collection is no longer available." };
    }
    try {
      const result: CollectionRunResult = await runCollectionAuto(
        collectionId,
        group.name,
        saved.map((item) => item.request),
        ctx.environment,
      );
      const root = getGitWorkspaceRoot();
      if (root) {
        await appendGitAgentHistory(root, {
          id: `hist_agent_${Date.now()}`,
          sentAt: new Date().toISOString(),
          source: "in-app-agent",
          kind: "run_collection",
          collectionId,
          collectionName: group.name,
          passed: result.passed,
          failed: result.failed,
          total: result.steps.length,
        }).catch(() => undefined);
      }
      return {
        markdown: [
          `**Collection run:** ${group.name}`,
          `Steps: ${result.steps.length} · Passed: ${result.passed} · Failed: ${result.failed} · Tests: ${result.totalTests}`,
        ].join("\n"),
        meta: { result },
      };
    } catch (error) {
      return {
        markdown: `Collection run failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return { markdown: "Nothing to confirm." };
}
