import { useEffect, useRef, useState } from "react";
import { Bot, Plug, Send, Trash2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { useAgentSettings } from "@/hooks/useAgentSettings";
import { useT } from "@/hooks/useLocale";
import {
  confirmAgentAction,
  runAgentIntent,
  type AgentActionContext,
  type AgentActionResult,
  type AgentConfirmKind,
} from "@/lib/agent-actions";
import { routeAgentInputAsync, buildAgentHelpText } from "@/lib/agent-router";
import type { AgentRagCitation } from "@/lib/agent-rag";
import {
  AGENT_CAPABILITIES,
  hydrateAgentApiKey,
  type AgentCapability,
} from "@/lib/agent-settings";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shallowEqualAppSlice, useAppActions, useAppSelector } from "@/machines";
import { selectActiveEnvironment, selectActiveTab } from "@/machines/appMachine";
import type { ApiRequest, CollectionGroup, SavedRequest } from "@/types";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  pendingConfirm?: AgentConfirmKind;
  confirmPayload?: AgentActionResult["confirmPayload"];
  openRequest?: ApiRequest;
  citations?: AgentRagCitation[];
  busy?: boolean;
};

const CHAT_STORAGE_KEY = "pulse-agent-chat-v1";
const CHAT_STORAGE_LIMIT = 40;

const QUICK_ACTIONS: Array<{
  id: string;
  labelKey: MessageKey;
  capability: AgentCapability;
}> = [
  { id: "quick:curl", labelKey: "agent.quick.curl", capability: "import_curl" },
  { id: "quick:explain", labelKey: "agent.quick.explain", capability: "explain_response" },
  { id: "quick:workspace", labelKey: "agent.quick.workspace", capability: "workspace_status" },
  { id: "quick:run", labelKey: "agent.quick.run", capability: "run_collection" },
  { id: "quick:tests", labelKey: "agent.quick.tests", capability: "explain_tests" },
  { id: "quick:draft-tests", labelKey: "agent.quick.draftTests", capability: "draft_tests" },
  {
    id: "quick:draft-prerequest",
    labelKey: "agent.quick.draftPreRequest",
    capability: "draft_pre_request",
  },
  { id: "quick:history", labelKey: "agent.quick.history", capability: "workspace_history" },
  { id: "quick:memory", labelKey: "agent.quick.memory", capability: "memory" },
  { id: "quick:rag", labelKey: "agent.quick.rag", capability: "memory_rag" },
  { id: "quick:openapi", labelKey: "agent.quick.openapi", capability: "openapi" },
  { id: "quick:mock", labelKey: "agent.quick.mock", capability: "mock" },
  { id: "quick:diff", labelKey: "agent.quick.diff", capability: "diff" },
  { id: "quick:env", labelKey: "agent.quick.env", capability: "env_show" },
  { id: "quick:curl-export", labelKey: "agent.quick.curlExport", capability: "curl_export" },
  { id: "quick:contract", labelKey: "agent.quick.contract", capability: "contract_check" },
];

const CAP_GRID_LABEL: Partial<Record<AgentCapability, MessageKey>> = {
  import_curl: "agent.capability.import_curl",
  explain_response: "agent.capability.explain_response",
  draft_tests: "agent.capability.draft_tests",
  openapi: "agent.capability.openapi",
  mock: "agent.capability.mock",
  diff: "agent.capability.diff",
  env_show: "agent.capability.env_show",
  curl_export: "agent.capability.curl_export",
  contract_check: "agent.capability.contract_check",
  memory: "agent.capability.memory",
  run_collection: "agent.capability.run_collection",
};

function loadPersistedMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && item.id)
      .map((item) => ({
        ...item,
        busy: false,
        pendingConfirm: item.pendingConfirm,
      }))
      .slice(-CHAT_STORAGE_LIMIT);
  } catch {
    return [];
  }
}

function persistMessages(messages: ChatMessage[]) {
  try {
    const slim = messages
      .filter((item) => !item.busy)
      .slice(-CHAT_STORAGE_LIMIT)
      .map(({ busy: _busy, ...rest }) => rest);
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* ignore quota */
  }
}

function renderAgentMarkdown(text: string) {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return blocks.map((block, blockIndex) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const inner = block.slice(3, -3).replace(/^\w*\n/, "");
      return (
        <pre
          key={blockIndex}
          className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[12px] leading-relaxed"
        >
          {inner}
        </pre>
      );
    }
    return (
      <div key={blockIndex} className="space-y-1.5 whitespace-pre-wrap">
        {block.split("\n").map((line, lineIndex) => {
          if (line === "---") {
            return <hr key={lineIndex} className="my-2 border-border" />;
          }
          const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
          return (
            <p key={lineIndex} className="text-[13px] leading-relaxed text-foreground">
              {parts.map((part, partIndex) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return (
                    <strong key={partIndex} className="font-semibold">
                      {part.slice(2, -2)}
                    </strong>
                  );
                }
                if (part.startsWith("`") && part.endsWith("`")) {
                  return (
                    <code
                      key={partIndex}
                      className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[12px]"
                    >
                      {part.slice(1, -1)}
                    </code>
                  );
                }
                return <span key={partIndex}>{part}</span>;
              })}
            </p>
          );
        })}
      </div>
    );
  });
}

function nextId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function confirmToolLabel(kind: AgentConfirmKind, payload?: AgentActionResult["confirmPayload"]) {
  if (payload?.toolName) return payload.toolName;
  return kind;
}

export function AgentView() {
  const t = useT();
  const agentSettings = useAgentSettings();
  const {
    request,
    response,
    testResults,
    activeCollectionId,
    collectionGroups,
    collections,
    environments,
    activeEnvironment,
  } = useAppSelector((state) => {
    const tab = selectActiveTab(state.context);
    return {
      request: tab?.request ?? null,
      response: tab?.response ?? null,
      testResults: tab?.testResults ?? null,
      activeCollectionId: state.context.persisted.activeCollectionId,
      collectionGroups: state.context.persisted.collectionGroups,
      collections: state.context.persisted.collections,
      environments: state.context.persisted.environments,
      activeEnvironment: selectActiveEnvironment(state.context),
    };
  }, shallowEqualAppSlice);
  const {
    send,
    openRequestTab,
    setMainView,
    updateRequest,
    sendCurrentRequest,
    setActiveEnvironmentId,
  } = useAppActions();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadPersistedMessages());
  const [working, setWorking] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const quickActions = QUICK_ACTIONS.filter(
    (action) => agentSettings.enabled && agentSettings.capabilities[action.capability],
  );
  const emptyCaps = AGENT_CAPABILITIES.filter(
    (id) => agentSettings.capabilities[id] && CAP_GRID_LABEL[id],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, working]);

  useEffect(() => {
    persistMessages(messages);
  }, [messages]);

  useEffect(() => {
    void hydrateAgentApiKey().then(() => undefined);
  }, []);

  const buildContext = (onStreamDelta?: (chunk: string) => void): AgentActionContext => ({
    activeRequest: request,
    activeResponse: response,
    testResults,
    activeCollectionId,
    collectionGroups,
    collections,
    environments,
    environment: activeEnvironment,
    openRequestTab,
    setMainView,
    onStreamDelta,
    sendActiveRequest: sendCurrentRequest,
    updateActiveRequest: updateRequest,
    importOpenApi: (collection: CollectionGroup, requests: SavedRequest[]) =>
      send({ type: "IMPORT_OPENAPI", collection, requests }),
    setActiveEnvironmentId,
  });

  const applyResult = (result: AgentActionResult, replaceId?: string) => {
    if (result.applyToActive) {
      updateRequest(result.applyToActive);
    }
    const message: ChatMessage = {
      id: replaceId ?? nextId("assistant"),
      role: "assistant",
      text: result.markdown,
      pendingConfirm: result.needsConfirm,
      confirmPayload: result.confirmPayload,
      openRequest: result.openRequest,
      citations: result.citations,
    };
    setMessages((prev) => {
      if (replaceId) {
        return prev.map((item) => (item.id === replaceId ? message : item));
      }
      return [...prev, message];
    });
  };

  const runInput = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || working) return;

    const userMessage: ChatMessage = {
      id: nextId("user"),
      role: "user",
      text: trimmed,
    };
    const streamId = nextId("assistant");
    streamIdRef.current = streamId;
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: streamId, role: "assistant", text: "", busy: true },
    ]);
    setInput("");
    setWorking(true);

    try {
      const intent = await routeAgentInputAsync(trimmed);
      const result = await runAgentIntent(
        intent,
        buildContext((chunk) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === streamId ? { ...item, text: `${item.text}${chunk}`, busy: true } : item,
            ),
          );
        }),
      );
      applyResult(result, streamId);
    } catch (error) {
      applyResult(
        {
          markdown: `Agent error: ${error instanceof Error ? error.message : String(error)}`,
        },
        streamId,
      );
    } finally {
      streamIdRef.current = null;
      setWorking(false);
    }
  };

  const handleConfirm = async (message: ChatMessage) => {
    if (!message.pendingConfirm || working) return;
    setWorking(true);
    const placeholderId = nextId("assistant");
    setMessages((prev) => [
      ...prev.map((item) =>
        item.id === message.id ? { ...item, pendingConfirm: undefined } : item,
      ),
      { id: placeholderId, role: "assistant", text: t("agent.working"), busy: true },
    ]);
    try {
      const result = await confirmAgentAction(
        message.pendingConfirm,
        buildContext(),
        message.confirmPayload,
      );
      applyResult(result, placeholderId);
    } catch (error) {
      applyResult(
        {
          markdown: `Confirm failed: ${error instanceof Error ? error.message : String(error)}`,
        },
        placeholderId,
      );
    } finally {
      setWorking(false);
    }
  };

  const handleOpenRequest = (apiRequest: ApiRequest) => {
    openRequestTab(apiRequest);
    setMainView("request");
  };

  const handleOpenAndSend = (apiRequest: ApiRequest) => {
    openRequestTab(apiRequest);
    setMainView("request");
    window.setTimeout(() => sendCurrentRequest(), 0);
  };

  const clearChat = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  if (!agentSettings.enabled) {
    return (
      <PageShell resetKey="agent-off" width="wide">
        <div className="docs-masthead" data-tour="agent">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-caption text-muted-foreground">{t("agent.eyebrow")}</p>
              <h1 className="text-display mt-1 text-balance">{t("agent.disabled.title")}</h1>
              <p className="mt-2 max-w-3xl text-body text-muted-foreground">
                {t("agent.disabled.description")}
              </p>
              <div className="mt-4">
                <Button type="button" onClick={() => setMainView("settings")}>
                  {t("agent.settings.nav")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell resetKey="agent" width="wide">
      <div className="docs-masthead" data-tour="agent">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">{t("agent.eyebrow")}</p>
            <h1 className="text-display mt-1 text-balance">{t("view.agent.title")}</h1>
            <p className="mt-2 max-w-3xl text-body text-muted-foreground">
              {t("view.agent.description")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMainView("mcp")}
            >
              <Plug className="size-3.5" />
              {t("agent.openMcp")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={messages.length === 0}
              onClick={clearChat}
            >
              <Trash2 className="size-3.5" />
              {t("agent.clear")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <Button
            key={action.id}
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            onClick={() => void runInput(action.id)}
          >
            {t(action.labelKey)}
          </Button>
        ))}
      </div>

      <Panel className="mt-4 flex min-h-[420px] flex-1 flex-col">
        <PanelHeader title="Chat" label="AGENT" />
        <PanelBody className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-[280px] flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-3 py-6">
                <p className="text-center text-sm text-muted-foreground">{t("agent.empty")}</p>
                <p className="mt-4 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("agent.empty.capabilities")}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {emptyCaps.map((id) => (
                    <div
                      key={id}
                      className="rounded-md border border-border bg-surface-1 px-2.5 py-2 text-[12px] text-foreground"
                    >
                      {CAP_GRID_LABEL[id] ? t(CAP_GRID_LABEL[id]!) : id}
                    </div>
                  ))}
                </div>
                <pre className="mt-4 max-h-40 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {buildAgentHelpText(agentSettings)}
                </pre>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  message.role === "user"
                    ? "ml-8 border-primary/30 bg-primary/5"
                    : "mr-8 border-border bg-surface-1",
                )}
              >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {message.role === "user" ? "You" : "Pulse"}
                </p>
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.text}</p>
                ) : (
                  <div className={cn(message.busy && "text-muted-foreground")}>
                    {renderAgentMarkdown(message.text)}
                  </div>
                )}
                {(message.pendingConfirm ||
                  message.openRequest ||
                  (message.citations && message.citations.length > 0)) && (
                  <div className="mt-3 space-y-2 border-t border-border pt-2">
                    {message.pendingConfirm && (
                      <div className="rounded-md border border-amber-500/35 bg-amber-500/5 px-2.5 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          {t("agent.confirm.title")}
                        </p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {t("agent.confirm.tool", {
                            tool: confirmToolLabel(message.pendingConfirm, message.confirmPayload),
                          })}
                        </p>
                        {message.confirmPayload &&
                          Object.keys(message.confirmPayload).some(
                            (key) => key !== "toolName" && message.confirmPayload?.[key as keyof typeof message.confirmPayload],
                          ) && (
                            <pre className="mt-2 max-h-28 overflow-auto rounded border border-border bg-muted/40 p-2 font-mono text-[11px]">
                              {JSON.stringify(
                                Object.fromEntries(
                                  Object.entries(message.confirmPayload).filter(
                                    ([key, value]) => key !== "toolName" && value != null && value !== "",
                                  ),
                                ),
                                null,
                                2,
                              )}
                            </pre>
                          )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={working}
                            onClick={() => void handleConfirm(message)}
                          >
                            {t("agent.confirm")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={working}
                            onClick={() =>
                              setMessages((prev) =>
                                prev.map((item) =>
                                  item.id === message.id
                                    ? { ...item, pendingConfirm: undefined }
                                    : item,
                                ),
                              )
                            }
                          >
                            {t("agent.cancel")}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {message.openRequest && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => handleOpenRequest(message.openRequest!)}
                        >
                          {t("agent.openRequest")}
                        </Button>
                      )}
                      {message.citations?.map((citation) => (
                        <div key={citation.id} className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenRequest(citation.request)}
                          >
                            {citation.label}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenAndSend(citation.request)}
                            title={t("agent.sendCitation")}
                          >
                            <Send className="size-3.5" />
                            {t("agent.send")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {working && messages[messages.length - 1]?.role === "user" && (
              <p className="text-sm text-muted-foreground">{t("agent.working")}</p>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-border pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void runInput(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("agent.placeholder")}
              className="min-h-[72px] flex-1 resize-y"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void runInput(input);
                }
              }}
            />
            <Button type="submit" disabled={working || !input.trim()} className="shrink-0">
              <Send className="size-3.5" />
              {t("agent.send")}
            </Button>
          </form>
        </PanelBody>
      </Panel>
    </PageShell>
  );
}
