import { useEffect, useRef, useState } from "react";
import { Bot, Plug, Send, Trash2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/useLocale";
import {
  confirmAgentAction,
  runAgentIntent,
  type AgentActionContext,
  type AgentActionResult,
  type AgentConfirmKind,
} from "@/lib/agent-actions";
import { routeAgentInput } from "@/lib/agent-router";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useApp } from "@/machines";
import type { ApiRequest } from "@/types";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  pendingConfirm?: AgentConfirmKind;
  openRequest?: ApiRequest;
  busy?: boolean;
};

const QUICK_ACTIONS: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "quick:curl", labelKey: "agent.quick.curl" },
  { id: "quick:explain", labelKey: "agent.quick.explain" },
  { id: "quick:workspace", labelKey: "agent.quick.workspace" },
  { id: "quick:run", labelKey: "agent.quick.run" },
  { id: "quick:tests", labelKey: "agent.quick.tests" },
  { id: "quick:history", labelKey: "agent.quick.history" },
];

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

export function AgentView() {
  const t = useT();
  const {
    request,
    response,
    testResults,
    activeCollectionId,
    collectionGroups,
    collections,
    activeEnvironment,
    openRequestTab,
    setMainView,
  } = useApp();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [working, setWorking] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, working]);

  const buildContext = (): AgentActionContext => ({
    activeRequest: request,
    activeResponse: response,
    testResults,
    activeCollectionId,
    collectionGroups,
    collections,
    environment: activeEnvironment,
    openRequestTab,
    setMainView,
  });

  const applyResult = (result: AgentActionResult, replaceId?: string) => {
    const message: ChatMessage = {
      id: replaceId ?? nextId("assistant"),
      role: "assistant",
      text: result.markdown,
      pendingConfirm: result.needsConfirm,
      openRequest: result.openRequest,
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
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setWorking(true);

    try {
      const intent = routeAgentInput(trimmed);
      const result = await runAgentIntent(intent, buildContext());
      applyResult(result);
    } catch (error) {
      applyResult({
        markdown: `Agent error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
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
      const result = await confirmAgentAction(message.pendingConfirm, buildContext());
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
              onClick={() => setMessages([])}
            >
              <Trash2 className="size-3.5" />
              {t("agent.clear")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
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
              <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                {t("agent.empty")}
              </p>
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
                {(message.pendingConfirm || message.openRequest) && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-2">
                    {message.pendingConfirm && (
                      <>
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
                      </>
                    )}
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
