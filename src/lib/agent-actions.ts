import { curlToRequestAsync } from "@/lib/curl";
import { formatGraphqlResponse, parseGraphqlResponse, summarizeGraphqlSchemaLike } from "@/lib/agent-format";
import { runCollectionAuto, type CollectionRunResult } from "@/lib/collection-runner";
import {
  deleteAgentMemory,
  formatMemoryMarkdown,
  getAgentMemory,
  listAgentMemory,
  upsertAgentMemory,
} from "@/lib/agent-memory";
import {
  citationsFromRagHits,
  formatRagContextBlock,
  formatRagHitsMarkdown,
  reindexAgentRag,
  searchAgentRag,
  type AgentRagCitation,
} from "@/lib/agent-rag";
import {
  appendGitAgentHistory,
  getGitWorkspaceRoot,
  listGitAgentHistory,
  listGitPending,
} from "@/lib/git-workspace";
import type { AgentIntent } from "@/lib/agent-router";
import { buildAgentHelpText } from "@/lib/agent-router";
import {
  capabilityForIntent,
  isAgentCapabilityEnabled,
  isAgentEnabled,
  loadAgentSettings,
} from "@/lib/agent-settings";
import { t } from "@/lib/i18n";
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
  /** RAG citations that can open as request tabs. */
  citations?: AgentRagCitation[];
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
    t("agent.md.statusLabel", {
      status: `${response.status} ${response.statusText || ""}`.trim(),
    }),
    t("agent.md.timeSize", {
      time: response.elapsedMs ?? "—",
      size: response.sizeBytes ?? "—",
    }),
  ];
  if (response.fromCache) lines.push(t("agent.md.cacheHit"));
  const gql = parseGraphqlResponse(response.body);
  if (gql) {
    lines.push("");
    lines.push(formatGraphqlResponse(response.body));
  } else {
    const body = response.body?.trim() ?? "";
    const preview = body.length > 1200 ? `${body.slice(0, 1200)}\n…` : body;
    lines.push("");
    lines.push(t("agent.md.bodyPreview"));
    lines.push("```");
    lines.push(preview || t("agent.md.emptyBody"));
    lines.push("```");
  }
  return lines.join("\n");
}

function explainTests(results: TestRunResult): string {
  const failed = results.results.filter((item) => !item.passed);
  const lines = [
    t("agent.md.testsSummary", {
      passed: results.passed,
      failed: results.failed,
      total: results.total,
    }),
  ];
  if (failed.length === 0) {
    lines.push(t("agent.md.testsAllPassed"));
    return lines.join("\n");
  }
  lines.push("");
  lines.push(t("agent.md.testsFailures"));
  for (const item of failed.slice(0, 20)) {
    lines.push(`- ${item.name}${item.message ? `: ${item.message}` : ""}`);
  }
  if (failed.length > 20) lines.push(`…+${failed.length - 20} more`);
  return lines.join("\n");
}

export async function runAgentIntent(
  intent: AgentIntent,
  ctx: AgentActionContext,
): Promise<AgentActionResult> {
  const settings = loadAgentSettings();
  if (!isAgentEnabled(settings)) {
    return { markdown: buildAgentHelpText(settings) };
  }

  const capability = capabilityForIntent(intent.kind);
  if (capability && !isAgentCapabilityEnabled(capability, settings)) {
    return {
      markdown: t("agent.md.capabilityOff", { capability }),
    };
  }

  switch (intent.kind) {
    case "help":
      return { markdown: buildAgentHelpText(settings) };
    case "unknown":
      return {
        markdown: `${intent.input}\n\n---\n${buildAgentHelpText(settings)}`,
      };
    case "import_curl": {
      try {
        const request = await curlToRequestAsync(intent.curl);
        await recordAgentHistory("import_curl", {
          request: { method: request.method, url: request.url },
        });
        return {
          markdown: t("agent.md.parsedCurl", { method: request.method, url: request.url }),
          openRequest: request,
        };
      } catch (error) {
        return {
          markdown: t("agent.md.curlFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "explain_response": {
      if (!ctx.activeResponse) {
        return { markdown: t("agent.md.noResponse") };
      }
      await recordAgentHistory("explain_response", {
        response: { status: ctx.activeResponse.status },
      });
      let markdown = summarizeHttpResponse(ctx.activeResponse);
      const root = getGitWorkspaceRoot();
      let citations: AgentRagCitation[] | undefined;
      if (root && ctx.activeRequest) {
        const seed = [
          ctx.activeRequest.method,
          ctx.activeRequest.name,
          ctx.activeRequest.url,
          String(ctx.activeResponse.status),
        ]
          .filter(Boolean)
          .join(" ");
        try {
          const hits = await searchAgentRag(root, seed, 5);
          markdown += formatRagContextBlock(hits);
          citations = citationsFromRagHits(hits);
        } catch {
          /* best-effort context */
        }
      }
      return { markdown, citations };
    }
    case "explain_tests": {
      if (!ctx.testResults) {
        return { markdown: t("agent.md.noTests") };
      }
      await recordAgentHistory("explain_tests", {
        passed: ctx.testResults.passed,
        failed: ctx.testResults.failed,
      });
      let markdown = explainTests(ctx.testResults);
      const root = getGitWorkspaceRoot();
      let citations: AgentRagCitation[] | undefined;
      if (root) {
        const failNames = ctx.testResults.results
          .filter((item) => !item.passed)
          .map((item) => item.name)
          .slice(0, 5)
          .join(" ");
        const seed = [ctx.activeRequest?.method, ctx.activeRequest?.url, "test_fail", failNames]
          .filter(Boolean)
          .join(" ");
        try {
          const hits = await searchAgentRag(root, seed, 5);
          markdown += formatRagContextBlock(hits);
          citations = citationsFromRagHits(hits);
        } catch {
          /* best-effort */
        }
      }
      return { markdown, citations };
    }
    case "workspace_status": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspace") };
      }
      try {
        const pending = await listGitPending(root);
        const history = await listGitAgentHistory(root);
        await recordAgentHistory("workspace_status", {
          pendingCount: pending.length,
          historyCount: history.length,
        });
        let markdown = [
          t("agent.md.workspaceLabel", { root }),
          t("agent.md.pendingLabel", { count: pending.length }),
          ...(pending.slice(0, 12).map((item) => `- \`${item}\``) || []),
          pending.length > 12 ? `…+${pending.length - 12} more` : "",
          t("agent.md.historyCountLabel", { count: history.length }),
        ]
          .filter(Boolean)
          .join("\n");
        let citations: AgentRagCitation[] | undefined;
        try {
          const hits = await searchAgentRag(root, "preferred_base_url workspace", 5);
          markdown += formatRagContextBlock(hits);
          citations = citationsFromRagHits(hits);
        } catch {
          /* best-effort */
        }
        return {
          markdown,
          citations,
          meta: { root, pendingCount: pending.length, historyCount: history.length },
        };
      } catch (error) {
        return {
          markdown: t("agent.md.workspaceFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "workspace_history": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspaceHistory") };
      }
      try {
        const history = await listGitAgentHistory(root);
        const recent = history.slice(-15).reverse();
        if (recent.length === 0) {
          return { markdown: t("agent.md.historyEmpty") };
        }
        const lines = [t("agent.md.historyRecent"), ""];
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
          markdown: t("agent.md.historyFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "run_collection": {
      const collectionId = ctx.activeCollectionId;
      const group = ctx.collectionGroups.find((item) => item.id === collectionId);
      const requests = collectionRequests(collectionId, ctx.collections);
      if (!collectionId || !group || requests.length === 0) {
        return { markdown: t("agent.md.noCollection") };
      }
      return {
        markdown: t("agent.md.runReady", { name: group.name, count: requests.length }),
        needsConfirm: "run_collection",
        meta: { collectionId, collectionName: group.name, count: requests.length },
      };
    }
    case "graphql_summarize": {
      const body = ctx.activeResponse?.body;
      if (!body?.trim()) {
        return { markdown: t("agent.md.noGraphqlBody") };
      }
      const summary = summarizeGraphqlSchemaLike(body);
      if (!summary) {
        return { markdown: t("agent.md.notGraphql") };
      }
      await recordAgentHistory("graphql_summarize");
      return { markdown: summary };
    }
    case "sse_parse": {
      const { parseSseTextLocal } = await import("@/lib/agent-format");
      const events = parseSseTextLocal(intent.text);
      if (events.length === 0) {
        return { markdown: t("agent.md.noSse") };
      }
      await recordAgentHistory("sse_parse", { count: events.length });
      const lines = [t("agent.md.sseParsed", { count: events.length }), ""];
      for (const [index, event] of events.slice(0, 30).entries()) {
        const bits = [
          event.event ? `event=${event.event}` : null,
          event.id ? `id=${event.id}` : null,
          event.retryMs != null ? `retry=${event.retryMs}` : null,
        ].filter(Boolean);
        lines.push(`${index + 1}. ${bits.join(" · ") || "message"}`);
        lines.push("```");
        lines.push(event.data || t("agent.md.emptyBody"));
        lines.push("```");
      }
      if (events.length > 30) lines.push(`…+${events.length - 30} more`);
      return { markdown: lines.join("\n") };
    }
    case "remember": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspaceRemember") };
      }
      try {
        const fact = await upsertAgentMemory({
          workspaceRoot: root,
          key: intent.key,
          value: intent.value,
          scope: intent.scope,
          source: "in-app-agent",
        });
        await recordAgentHistory("remember", { key: fact.key, scope: fact.scope });
        return {
          markdown: t("agent.md.remembered", {
            key: fact.key,
            value: fact.value,
            scope: fact.scope,
          }),
          meta: { fact },
        };
      } catch (error) {
        return {
          markdown: t("agent.md.rememberFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "recall": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspaceMemory") };
      }
      const query = intent.query.trim();
      if (!query) return { markdown: t("agent.md.usageRecall") };
      try {
        const exact = await getAgentMemory(root, query);
        if (exact) {
          await recordAgentHistory("recall", { key: exact.key });
          return {
            markdown: `**${exact.key}** = ${exact.value} \`[${exact.scope}]\`${
              exact.note ? `\n_${exact.note}_` : ""
            }`,
            meta: { fact: exact },
          };
        }
        const found = await listAgentMemory(root, query);
        await recordAgentHistory("recall", { query, count: found.length });
        return {
          markdown: formatMemoryMarkdown(found, t("agent.md.recallTitle", { query })),
          meta: { count: found.length, facts: found },
        };
      } catch (error) {
        return {
          markdown: t("agent.md.recallFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "forget": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspaceForget") };
      }
      try {
        const removed = await deleteAgentMemory(root, intent.key);
        await recordAgentHistory("forget", { key: intent.key, removed });
        return {
          markdown: removed
            ? t("agent.md.forgot", { key: intent.key })
            : t("agent.md.forgetMissing", { key: intent.key }),
        };
      } catch (error) {
        return {
          markdown: t("agent.md.forgetFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "memory_list": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspaceMemoryList") };
      }
      try {
        const facts = await listAgentMemory(root);
        await recordAgentHistory("memory_list", { count: facts.length });
        return {
          markdown: formatMemoryMarkdown(facts, t("agent.md.memoryTitle")),
          meta: { count: facts.length, facts },
        };
      } catch (error) {
        return {
          markdown: t("agent.md.memoryListFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "rag_search": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspaceRag") };
      }
      const query = intent.query.trim();
      if (!query) {
        return { markdown: t("agent.md.usageRag") };
      }
      try {
        const hits = await searchAgentRag(root, query, 8);
        await recordAgentHistory("rag_search", { query, count: hits.length });
        return {
          markdown: formatRagHitsMarkdown(hits, query),
          citations: citationsFromRagHits(hits),
          meta: { query, hits },
        };
      } catch (error) {
        return {
          markdown: t("agent.md.ragFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    case "rag_reindex": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspaceRagReindex") };
      }
      try {
        const count = await reindexAgentRag(root);
        await recordAgentHistory("rag_reindex", { count });
        return {
          markdown: t("agent.md.ragRebuilt", { count }),
          meta: { count },
        };
      } catch (error) {
        return {
          markdown: t("agent.md.ragReindexFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }
    default:
      return { markdown: buildAgentHelpText(settings) };
  }
}

export async function confirmAgentAction(
  kind: AgentConfirmKind,
  ctx: AgentActionContext,
): Promise<AgentActionResult> {
  if (!isAgentEnabled() || (kind === "run_collection" && !isAgentCapabilityEnabled("run_collection"))) {
    return { markdown: buildAgentHelpText() };
  }
  if (kind === "run_collection") {
    const collectionId = ctx.activeCollectionId;
    const group = ctx.collectionGroups.find((item) => item.id === collectionId);
    const saved = collectionRequests(collectionId, ctx.collections);
    if (!collectionId || !group || saved.length === 0) {
      return { markdown: t("agent.md.collectionGone") };
    }
    try {
      const result: CollectionRunResult = await runCollectionAuto(
        collectionId,
        group.name,
        saved,
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
          t("agent.md.collectionRun", { name: group.name }),
          t("agent.md.collectionStats", {
            steps: result.steps.length,
            passed: result.passed,
            failed: result.failed,
            tests: result.totalTests,
          }),
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
