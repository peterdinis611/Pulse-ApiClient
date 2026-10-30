import { curlToRequestAsync, requestToCurlAsync } from "@/lib/curl";
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
  draftPreRequestFromResponse,
  draftTestsFromResponse,
  withDraftScripts,
} from "@/lib/agent-draft";
import { completeAgentLlm, streamAgentLlm, type AgentToolCall } from "@/lib/agent-llm";
import { checkWorkspaceContract } from "@/lib/contract";
import {
  appendGitAgentHistory,
  getGitWorkspaceRoot,
  getGitWorkspaceStatus,
  gitWorkspaceAdd,
  gitWorkspaceCommit,
  listGitAgentHistory,
  listGitPending,
} from "@/lib/git-workspace";
import { unifiedLineDiff, prettyMaybeJson } from "@/lib/line-diff";
import { importOpenApiCollection, listOpenApiOperations } from "@/lib/openapi-import";
import type { AgentIntent } from "@/lib/agent-router";
import { buildAgentHelpText } from "@/lib/agent-router";
import {
  canUseCloudForJob,
  capabilityForIntent,
  isAgentCapabilityEnabled,
  isAgentEnabled,
  loadAgentSettings,
  type AgentCloudJob,
} from "@/lib/agent-settings";
import { mockRoutesFromCollections, startMockServer } from "@/lib/mock-server";
import { isBetaFeatureEnabled } from "@/lib/release-channel";
import { t } from "@/lib/i18n";
import { createId } from "@/lib/helpers";
import type {
  ApiRequest,
  CollectionGroup,
  Environment,
  HttpMethod,
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
  environments: Environment[];
  environment: Environment | null;
  openRequestTab: (request: ApiRequest) => void;
  setMainView: (view: MainView) => void;
  /** Optional stream sink for cloud explain/unknown. */
  onStreamDelta?: (chunk: string) => void;
  sendActiveRequest?: () => void;
  /** Apply partial fields to the active request tab. */
  updateActiveRequest?: (patch: Partial<ApiRequest>) => void;
  /** Import OpenAPI collection into app state. */
  importOpenApi?: (collection: CollectionGroup, requests: SavedRequest[]) => void;
  /** Switch the active environment. */
  setActiveEnvironmentId?: (id: string | null) => void;
};

export type AgentConfirmKind =
  | "run_collection"
  | "send_request"
  | "remember"
  | "apply_draft_tests"
  | "write_request"
  | "mock_start"
  | "git_commit"
  | "import_openapi"
  | "switch_environment"
  | "set_header";

export type AgentConfirmPayload = {
  key?: string;
  value?: string;
  scope?: "workspace" | "local";
  name?: string;
  url?: string;
  method?: string;
  body?: string;
  message?: string;
  spec?: string;
  environmentId?: string;
  environmentName?: string;
  headerKey?: string;
  headerValue?: string;
  toolName?: string;
};

export type AgentActionResult = {
  markdown: string;
  /** When set, UI should show Confirm before calling `confirmAgentAction`. */
  needsConfirm?: AgentConfirmKind;
  /** Payload for remember / write / commit confirms. */
  confirmPayload?: AgentConfirmPayload;
  openRequest?: ApiRequest;
  /** Apply these fields to the active request (draft tests / pre-request). */
  applyToActive?: Partial<ApiRequest>;
  /** RAG citations that can open as request tabs. */
  citations?: AgentRagCitation[];
  meta?: Record<string, unknown>;
};

async function maybeEnrichWithLlm(
  localMarkdown: string,
  userPrompt: string,
  job: AgentCloudJob,
  ragBlock = "",
  onStreamDelta?: (chunk: string) => void,
): Promise<string> {
  const settings = loadAgentSettings();
  if (settings.provider === "none" || !canUseCloudForJob(job, settings)) {
    return localMarkdown;
  }
  const messages = [
    {
      role: "user" as const,
      content: [
        userPrompt,
        "",
        "Local summary:",
        localMarkdown,
        "",
        "RAG context:",
        ragBlock.trim() || "(none)",
      ].join("\n"),
    },
  ];
  try {
    if (onStreamDelta) {
      const text = await streamAgentLlm({
        provider: settings.provider,
        apiKey: settings.apiKey,
        messages,
        onDelta: onStreamDelta,
      });
      if (!text.trim()) return localMarkdown;
      return `${text}\n\n---\n_${t("agent.md.llmLocalFooter")}_\n\n${localMarkdown}`;
    }
    const result = await completeAgentLlm({
      provider: settings.provider,
      apiKey: settings.apiKey,
      messages,
    });
    const text = result.text.trim();
    if (!text) return localMarkdown;
    return `${text}\n\n---\n_${t("agent.md.llmLocalFooter")}_\n\n${localMarkdown}`;
  } catch (error) {
    return `${localMarkdown}\n\n---\n_${t("agent.md.llmFailed", {
      error: error instanceof Error ? error.message : String(error),
    })}_`;
  }
}

function withToolName(
  result: AgentActionResult,
  toolName: string,
): AgentActionResult {
  return {
    ...result,
    confirmPayload: { ...result.confirmPayload, toolName },
  };
}

function toolCallsToConfirm(toolCalls: AgentToolCall[]): AgentActionResult | null {
  const call = toolCalls[0];
  if (!call) return null;
  if (call.name === "run_active_collection") {
    return withToolName(
      {
        markdown: t("agent.md.toolRunCollection"),
        needsConfirm: "run_collection",
      },
      call.name,
    );
  }
  if (call.name === "send_active_request") {
    return withToolName(
      {
        markdown: t("agent.md.toolSendRequest"),
        needsConfirm: "send_request",
      },
      call.name,
    );
  }
  if (call.name === "remember_fact") {
    try {
      const args = JSON.parse(call.arguments) as {
        key?: string;
        value?: string;
        scope?: string;
      };
      if (!args.key?.trim() || args.value == null) return null;
      return withToolName(
        {
          markdown: t("agent.md.toolRemember", { key: args.key, value: String(args.value) }),
          needsConfirm: "remember",
          confirmPayload: {
            key: args.key.trim(),
            value: String(args.value),
            scope: args.scope === "local" ? "local" : "workspace",
          },
        },
        call.name,
      );
    } catch {
      return null;
    }
  }
  if (call.name === "apply_draft_tests") {
    return withToolName(
      {
        markdown: t("agent.md.toolApplyDraftTests"),
        needsConfirm: "apply_draft_tests",
      },
      call.name,
    );
  }
  if (call.name === "write_request_fields") {
    try {
      const args = JSON.parse(call.arguments) as {
        name?: string;
        url?: string;
        method?: string;
        body?: string;
      };
      return withToolName(
        {
          markdown: `${t("agent.md.toolWriteRequest")}\n\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``,
          needsConfirm: "write_request",
          confirmPayload: args,
        },
        call.name,
      );
    } catch {
      return null;
    }
  }
  if (call.name === "start_mock_server") {
    return withToolName(
      {
        markdown: t("agent.md.toolMockStart"),
        needsConfirm: "mock_start",
      },
      call.name,
    );
  }
  if (call.name === "import_openapi_spec") {
    try {
      const args = JSON.parse(call.arguments) as { spec?: string };
      const spec = args.spec?.trim();
      if (!spec) return null;
      return withToolName(
        {
          markdown: t("agent.md.toolImportOpenapi"),
          needsConfirm: "import_openapi",
          confirmPayload: { spec },
        },
        call.name,
      );
    } catch {
      return null;
    }
  }
  if (call.name === "switch_environment") {
    try {
      const args = JSON.parse(call.arguments) as {
        environmentId?: string;
        environmentName?: string;
        name?: string;
      };
      const environmentName = args.environmentName?.trim() || args.name?.trim() || args.environmentId?.trim();
      if (!environmentName && !args.environmentId?.trim()) return null;
      return withToolName(
        {
          markdown: t("agent.md.toolSwitchEnv", { name: environmentName || args.environmentId || "" }),
          needsConfirm: "switch_environment",
          confirmPayload: {
            environmentId: args.environmentId?.trim(),
            environmentName: environmentName || undefined,
          },
        },
        call.name,
      );
    } catch {
      return null;
    }
  }
  if (call.name === "set_header") {
    try {
      const args = JSON.parse(call.arguments) as { key?: string; value?: string };
      if (!args.key?.trim()) return null;
      return withToolName(
        {
          markdown: t("agent.md.toolSetHeader", {
            key: args.key.trim(),
            value: args.value ?? "",
          }),
          needsConfirm: "set_header",
          confirmPayload: {
            headerKey: args.key.trim(),
            headerValue: args.value ?? "",
          },
        },
        call.name,
      );
    } catch {
      return null;
    }
  }
  if (call.name === "diff_response_example") {
    return {
      markdown: t("agent.md.toolDiff"),
      meta: { tool: "diff_response_example" },
    };
  }
  if (isBetaFeatureEnabled("git_commit") && call.name === "propose_commit_message") {
    try {
      const args = JSON.parse(call.arguments) as { message?: string };
      const message = args.message?.trim();
      if (!message) return null;
      return withToolName(
        {
          markdown: `Stage dirty files and commit with:\n\n> ${message}`,
          needsConfirm: "git_commit",
          confirmPayload: { message },
        },
        call.name,
      );
    } catch {
      return null;
    }
  }
  return null;
}

async function runResponseDiff(ctx: AgentActionContext): Promise<AgentActionResult> {
  const examples = ctx.activeRequest?.examples ?? [];
  const exampleBody = examples[examples.length - 1]?.response?.body?.trim() ?? "";
  const responseBody = ctx.activeResponse?.body?.trim() ?? "";
  if (!exampleBody || !responseBody) {
    return { markdown: t("agent.md.noDiffBodies") };
  }
  try {
    const left = await prettyMaybeJson(exampleBody).catch(() => exampleBody);
    const right = await prettyMaybeJson(responseBody).catch(() => responseBody);
    const rows = await unifiedLineDiff(left, right);
    const added = rows.filter((row) => row.kind === "add").length;
    const removed = rows.filter((row) => row.kind === "del").length;
    const unified = rows
      .map((row) => {
        if (row.kind === "add") return `+${row.text}`;
        if (row.kind === "del") return `-${row.text}`;
        return ` ${row.text}`;
      })
      .join("\n");
    await recordAgentHistory("response_diff", { added, removed });
    return {
      markdown: `${t("agent.md.diffTitle", { added, removed })}\n\n\`\`\`diff\n${unified}\n\`\`\``,
      meta: { added, removed },
    };
  } catch (error) {
    return {
      markdown: `Diff failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function formatEnvMarkdown(environments: Environment[]): string {
  if (environments.length === 0) {
    return t("agent.md.envEmpty");
  }
  const lines = [t("agent.md.envTitle"), ""];
  for (const env of environments) {
    lines.push(`### ${env.name}`);
    const vars = env.variables.filter((item) => item.enabled);
    if (vars.length === 0) {
      lines.push(t("agent.md.envNoVars"));
    }
    for (const variable of vars.slice(0, 40)) {
      const masked =
        variable.secret || variable.key.startsWith("secret.")
          ? "••••"
          : variable.value.length > 80
            ? `${variable.value.slice(0, 80)}…`
            : variable.value;
      lines.push(`- \`${variable.key}\` = \`${masked}\``);
    }
    if (vars.length > 40) lines.push(`…+${vars.length - 40} more`);
    lines.push("");
  }
  return lines.join("\n");
}

async function maybeToolCallFromUnknown(
  input: string,
  ragBlock: string,
  ctx: AgentActionContext,
): Promise<AgentActionResult | null> {
  const settings = loadAgentSettings();
  if (settings.provider === "none" || !canUseCloudForJob("tools", settings)) {
    return null;
  }
  try {
    const result = await completeAgentLlm({
      provider: settings.provider,
      apiKey: settings.apiKey,
      tools: true,
      messages: [
        {
          role: "user",
          content: [
            "The user asked:",
            input,
            "",
            "RAG context:",
            ragBlock.trim() || "(none)",
            "",
            "If you can help by proposing a tool, call one of: send_active_request, run_active_collection, remember_fact, apply_draft_tests, write_request_fields, start_mock_server, import_openapi_spec, switch_environment, set_header, diff_response_example. Otherwise answer briefly without tools.",
          ].join("\n"),
        },
      ],
    });
    if (result.toolCalls.length > 0) {
      const call = result.toolCalls[0];
      if (call?.name === "diff_response_example") {
        const diff = await runResponseDiff(ctx);
        if (result.text.trim()) {
          diff.markdown = `${result.text.trim()}\n\n---\n${diff.markdown}`;
        }
        return diff;
      }
      const confirm = toolCallsToConfirm(result.toolCalls);
      if (confirm) {
        if (result.text.trim()) {
          confirm.markdown = `${result.text.trim()}\n\n---\n${confirm.markdown}`;
        }
        return confirm;
      }
    }
    if (result.text.trim()) {
      return { markdown: result.text.trim() };
    }
  } catch {
    /* fall through to local */
  }
  return null;
}

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

async function summarizeHttpResponse(response: HttpResponse): Promise<string> {
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
    lines.push(await formatGraphqlResponse(response.body));
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
    case "unknown": {
      const help = buildAgentHelpText(settings);
      const local = `${intent.input}\n\n---\n${help}`;
      const root = getGitWorkspaceRoot();
      let ragBlock = "";
      if (root) {
        try {
          const hits = await searchAgentRag(root, intent.input, 5);
          ragBlock = formatRagContextBlock(hits);
        } catch {
          /* best-effort */
        }
      }
      const toolResult = await maybeToolCallFromUnknown(intent.input, ragBlock, ctx);
      if (toolResult) return toolResult;
      const markdown = await maybeEnrichWithLlm(
        local,
        `The user said something the local router did not match. Answer helpfully using Pulse agent capabilities and the RAG context. User input:\n${intent.input}`,
        "unknown",
        ragBlock,
        ctx.onStreamDelta,
      );
      return { markdown };
    }
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
      let local = await summarizeHttpResponse(ctx.activeResponse);
      const root = getGitWorkspaceRoot();
      let citations: AgentRagCitation[] | undefined;
      let ragBlock = "";
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
          ragBlock = formatRagContextBlock(hits);
          local += ragBlock;
          citations = citationsFromRagHits(hits);
        } catch {
          /* best-effort context */
        }
      }
      const markdown = await maybeEnrichWithLlm(
        local,
        "Explain this HTTP response for an API client user. Call out status, timing, likely issues, and next steps.",
        "explain",
        ragBlock,
        ctx.onStreamDelta,
      );
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
      let local = explainTests(ctx.testResults);
      const root = getGitWorkspaceRoot();
      let citations: AgentRagCitation[] | undefined;
      let ragBlock = "";
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
          ragBlock = formatRagContextBlock(hits);
          local += ragBlock;
          citations = citationsFromRagHits(hits);
        } catch {
          /* best-effort */
        }
      }
      const markdown = await maybeEnrichWithLlm(
        local,
        "Explain these Pulse test results. Focus on failures and how to fix them.",
        "explain",
        ragBlock,
        ctx.onStreamDelta,
      );
      return { markdown, citations };
    }
    case "draft_tests": {
      if (!ctx.activeResponse || !ctx.activeRequest) {
        return { markdown: t("agent.md.noResponse") };
      }
      const tests = draftTestsFromResponse(ctx.activeResponse);
      const openRequest = withDraftScripts(ctx.activeRequest, { tests });
      await recordAgentHistory("draft_tests", { status: ctx.activeResponse.status });
      return {
        markdown: `${t("agent.md.draftTests")}\n\n\`\`\`js\n${tests}\`\`\``,
        openRequest,
        applyToActive: { tests },
      };
    }
    case "draft_pre_request": {
      if (!ctx.activeResponse || !ctx.activeRequest) {
        return { markdown: t("agent.md.noResponse") };
      }
      const preRequestScript = draftPreRequestFromResponse(ctx.activeResponse);
      const openRequest = withDraftScripts(ctx.activeRequest, { preRequestScript });
      await recordAgentHistory("draft_pre_request", { status: ctx.activeResponse.status });
      return {
        markdown: `${t("agent.md.draftPreRequest")}\n\n\`\`\`js\n${preRequestScript}\`\`\``,
        openRequest,
        applyToActive: { preRequestScript },
      };
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
      const summary = await summarizeGraphqlSchemaLike(body);
      if (!summary) {
        return { markdown: t("agent.md.notGraphql") };
      }
      await recordAgentHistory("graphql_summarize");
      return { markdown: summary };
    }
    case "sse_parse": {
      const { parseSseTextLocal } = await import("@/lib/agent-format");
      const events = await parseSseTextLocal(intent.text);
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
    case "openapi_import": {
      const spec = intent.spec?.trim();
      if (!spec) {
        return { markdown: t("agent.md.pasteOpenapi") };
      }
      try {
        const imported = await importOpenApiCollection(spec);
        ctx.importOpenApi?.(imported.collection, imported.requests);
        await recordAgentHistory("openapi_import", {
          requests: imported.requests.length,
          title: imported.collection.name,
        });
        return {
          markdown: t("agent.md.openapiImported", {
            name: imported.collection.name,
            count: imported.requests.length,
          }),
          meta: { collection: imported.collection, requests: imported.requests },
        };
      } catch (error) {
        return {
          markdown: `OpenAPI import failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    case "openapi_list": {
      const spec = intent.spec?.trim();
      if (!spec) {
        return { markdown: t("agent.md.pasteOpenapi") };
      }
      try {
        const ops = await listOpenApiOperations(spec);
        if (ops.length === 0) {
          return { markdown: t("agent.md.openapiListEmpty") };
        }
        const lines = [t("agent.md.openapiListTitle", { count: ops.length }), ""];
        for (const op of ops.slice(0, 80)) {
          lines.push(`- \`${op.method}\` \`${op.path}\` — ${op.summary}`);
        }
        if (ops.length > 80) lines.push(`…+${ops.length - 80} more`);
        await recordAgentHistory("openapi_list", { count: ops.length });
        return { markdown: lines.join("\n"), meta: { operations: ops } };
      } catch (error) {
        return {
          markdown: `OpenAPI list failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    case "response_diff":
      return runResponseDiff(ctx);
    case "mock_start": {
      const routes = await mockRoutesFromCollections(ctx.collections).catch(() => []);
      if (routes.length === 0) {
        return { markdown: "No mock routes — save response examples on requests first." };
      }
      return {
        markdown: t("agent.md.mockReady"),
        needsConfirm: "mock_start",
        confirmPayload: { toolName: "start_mock_server" },
        meta: { routeCount: routes.length },
      };
    }
    case "env_show": {
      const markdown = formatEnvMarkdown(ctx.environments ?? []);
      await recordAgentHistory("env_show", { environments: ctx.environments?.length ?? 0 });
      return { markdown };
    }
    case "curl_export": {
      if (!ctx.activeRequest) {
        return { markdown: t("agent.md.curlExportMissing") };
      }
      try {
        const command = await requestToCurlAsync(ctx.activeRequest, ctx.environment);
        await recordAgentHistory("curl_export", {
          method: ctx.activeRequest.method,
          url: ctx.activeRequest.url,
        });
        return {
          markdown: `\`\`\`bash\n${command}\n\`\`\``,
          meta: { curl: command },
        };
      } catch (error) {
        return {
          markdown: `cURL export failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    case "contract_check": {
      const root = getGitWorkspaceRoot();
      if (!root) {
        return { markdown: t("agent.md.noWorkspace") };
      }
      try {
        const report = await checkWorkspaceContract(root);
        await recordAgentHistory("contract_check", {
          ok: report.ok,
          errors: report.errors.length,
        });
        if (report.ok) {
          return { markdown: t("agent.md.contractOk"), meta: { report } };
        }
        const lines = [
          t("agent.md.contractFail", { count: report.errors.length }),
          "",
          ...report.errors.slice(0, 40).map((err) => `- ${err}`),
        ];
        if (report.errors.length > 40) {
          lines.push(`…+${report.errors.length - 40} more`);
        }
        return { markdown: lines.join("\n"), meta: { report } };
      } catch (error) {
        return {
          markdown: `Contract check failed: ${error instanceof Error ? error.message : String(error)}`,
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
  payload?: AgentConfirmPayload,
): Promise<AgentActionResult> {
  if (!isAgentEnabled()) {
    return { markdown: buildAgentHelpText() };
  }
  if (kind === "import_openapi") {
    const spec = payload?.spec?.trim();
    if (!spec) return { markdown: t("agent.md.pasteOpenapi") };
    try {
      const imported = await importOpenApiCollection(spec);
      ctx.importOpenApi?.(imported.collection, imported.requests);
      await recordAgentHistory("openapi_import", {
        requests: imported.requests.length,
        title: imported.collection.name,
      });
      return {
        markdown: t("agent.md.openapiImported", {
          name: imported.collection.name,
          count: imported.requests.length,
        }),
        meta: { collection: imported.collection, requests: imported.requests },
      };
    } catch (error) {
      return {
        markdown: `OpenAPI import failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  if (kind === "switch_environment") {
    const envs = ctx.environments ?? [];
    const match =
      envs.find((env) => env.id === payload?.environmentId) ||
      envs.find(
        (env) =>
          env.name.toLowerCase() === (payload?.environmentName ?? "").toLowerCase(),
      );
    if (!match) {
      return { markdown: `Environment not found: ${payload?.environmentName || payload?.environmentId || "—"}` };
    }
    ctx.setActiveEnvironmentId?.(match.id);
    return { markdown: `Switched active environment to **${match.name}**.` };
  }
  if (kind === "set_header") {
    if (!ctx.activeRequest) {
      return { markdown: t("agent.md.noResponse") };
    }
    const headerKey = payload?.headerKey?.trim();
    if (!headerKey) return { markdown: "Header key is required." };
    const headers = [...(ctx.activeRequest.headers ?? [])];
    const existing = headers.findIndex(
      (item) => item.key.toLowerCase() === headerKey.toLowerCase(),
    );
    if (existing >= 0) {
      headers[existing] = {
        ...headers[existing],
        key: headerKey,
        value: payload?.headerValue ?? "",
        enabled: true,
      };
    } else {
      headers.push({
        id: createId("hdr"),
        key: headerKey,
        value: payload?.headerValue ?? "",
        enabled: true,
      });
    }
    const patch = { headers };
    ctx.updateActiveRequest?.(patch);
    return {
      markdown: `Set header \`${headerKey}\` on the active request.`,
      applyToActive: patch,
    };
  }
  if (kind === "apply_draft_tests") {
    if (!ctx.activeResponse || !ctx.activeRequest) {
      return { markdown: t("agent.md.noResponse") };
    }
    const tests = draftTestsFromResponse(ctx.activeResponse);
    const patch = { tests };
    ctx.updateActiveRequest?.(patch);
    return {
      markdown: t("agent.md.draftTests"),
      applyToActive: patch,
    };
  }
  if (kind === "write_request") {
    if (!ctx.activeRequest) {
      return { markdown: t("agent.md.noResponse") };
    }
    const patch: Partial<ApiRequest> = {};
    if (payload?.name?.trim()) patch.name = payload.name.trim();
    if (payload?.url?.trim()) patch.url = payload.url.trim();
    if (payload?.method?.trim()) patch.method = payload.method.trim().toUpperCase() as HttpMethod;
    if (payload?.body != null) patch.body = payload.body;
    if (Object.keys(patch).length === 0) {
      return { markdown: "No fields to update." };
    }
    ctx.updateActiveRequest?.(patch);
    return { markdown: "Updated the active request.", applyToActive: patch };
  }
  if (kind === "mock_start") {
    try {
      const routes = await mockRoutesFromCollections(ctx.collections);
      if (routes.length === 0) {
        return { markdown: "No saved examples to mock — save a response example first." };
      }
      const handle = await startMockServer(routes);
      return {
        markdown: `Mock server listening on ${handle.url} (${handle.routeCount} routes).`,
        meta: { handle },
      };
    } catch (error) {
      return {
        markdown: `Mock start failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  if (kind === "git_commit") {
    const root = getGitWorkspaceRoot();
    const message = payload?.message?.trim();
    if (!root) return { markdown: t("agent.md.noWorkspaceMemory") };
    if (!message) return { markdown: "Commit message is required." };
    try {
      const status = await getGitWorkspaceStatus(root);
      const paths = (status.files ?? []).map((file) => file.path);
      if (paths.length === 0) {
        return { markdown: "Nothing to commit — workspace is clean." };
      }
      await gitWorkspaceAdd(root, paths);
      const summary = await gitWorkspaceCommit(root, message);
      return { markdown: `Committed:\n\n\`\`\`\n${summary || message}\n\`\`\`` };
    } catch (error) {
      return {
        markdown: `Commit failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  if (kind === "send_request") {
    if (!ctx.activeRequest) {
      return { markdown: t("agent.md.noResponse") };
    }
    ctx.sendActiveRequest?.();
    await recordAgentHistory("send_request", {
      request: { method: ctx.activeRequest.method, url: ctx.activeRequest.url },
    });
    return { markdown: t("agent.md.sendStarted") };
  }
  if (kind === "remember") {
    if (!isAgentCapabilityEnabled("memory")) {
      return { markdown: t("agent.md.capabilityOff", { capability: "memory" }) };
    }
    const key = payload?.key?.trim();
    const value = payload?.value ?? "";
    if (!key) return { markdown: t("agent.md.usageRemember") };
    const root = getGitWorkspaceRoot();
    if (!root && payload?.scope !== "local") {
      return { markdown: t("agent.md.noWorkspaceMemory") };
    }
    try {
      const scope = payload?.scope ?? "workspace";
      await upsertAgentMemory({
        workspaceRoot: root ?? "",
        key,
        value,
        scope,
      });
      await recordAgentHistory("remember", { key, scope });
      return { markdown: t("agent.md.remembered", { key, value, scope }) };
    } catch (error) {
      return {
        markdown: t("agent.md.rememberFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }
  if (kind === "run_collection") {
    if (!isAgentCapabilityEnabled("run_collection")) {
      return { markdown: buildAgentHelpText() };
    }
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
