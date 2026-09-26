import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plug, Radio, Unplug } from "lucide-react";
import { useApp } from "@/machines";
import { isSseProtocol } from "@/lib/protocol";
import { prettyJson } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  connectionInit,
  connectionInitPayloadFromAuth,
  graphqlComplete,
  graphqlSubscribe,
} from "@/lib/graphql-ws";
import type { WebSocketMessage } from "@/types";

function formatMessageData(message: WebSocketMessage): string {
  if (message.binary) {
    return `[binary] ${message.data}`;
  }
  if (!message.data) {
    return "(empty)";
  }
  try {
    return prettyJson(message.data);
  } catch {
    return message.data;
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "status-badge-success";
    case "connecting":
      return "status-badge-warning";
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function frameBadgeClass(frameType: string | undefined): string {
  switch (frameType) {
    case "connection_ack":
    case "complete":
    case "pong":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "next":
    case "data":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "subscribe":
    case "connection_init":
    case "ping":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
    default:
      return "";
  }
}

export function WebSocketPanel() {
  const { ws, request, connectWebSocket, disconnectWebSocket, sendWebSocketMessage, sendWebSocketPing } =
    useApp();
  const isSse = isSseProtocol(request.protocol);
  const isGraphqlWs = !isSse && request.bodyKind === "graphql";
  const [draft, setDraft] = useState(
    isGraphqlWs ? '{"type":"ping"}' : '{"type":"ping"}',
  );
  const [sendBinary, setSendBinary] = useState(false);
  const [view, setView] = useState<"messages" | "handshake">("messages");
  const [eventFilter, setEventFilter] = useState("");
  const [subscriptionCounter, setSubscriptionCounter] = useState(1);

  useEffect(() => {
    if (ws.status === "open") {
      setView("messages");
    }
  }, [ws.status]);

  useEffect(() => {
    if (isGraphqlWs) {
      setDraft('{"type":"ping"}');
    }
  }, [isGraphqlWs]);

  const canConnect = ws.status === "idle" || ws.status === "closed" || ws.status === "error";
  const canDisconnect = ws.status === "open" || ws.status === "connecting";
  const canSend = ws.status === "open" && draft.trim().length > 0;
  const activeSubscriptionId = ws.graphqlSubscriptionIds?.[ws.graphqlSubscriptionIds.length - 1];

  const filteredMessages = useMemo(() => {
    const needle = eventFilter.trim().toLowerCase();
    if (!needle) return ws.messages;
    return ws.messages.filter((message) => {
      const hay = `${message.event ?? ""} ${message.eventId ?? ""}`.toLowerCase();
      return hay.includes(needle) || message.data.toLowerCase().includes(needle);
    });
  }, [eventFilter, ws.messages]);

  const sendSubscribe = () => {
    let variables: unknown;
    try {
      variables = JSON.parse(request.graphqlVariables || "{}");
    } catch {
      variables = {};
    }
    const id = String(subscriptionCounter);
    setSubscriptionCounter((value) => value + 1);
    sendWebSocketMessage(
      graphqlSubscribe(
        id,
        request.graphqlQuery || "subscription { _ }",
        variables,
        request.graphqlOperationName,
      ),
    );
  };

  const sendConnectionInit = () => {
    const payload = connectionInitPayloadFromAuth({
      authType: request.auth.authType,
      bearerToken: request.auth.bearerToken,
      apiKeyKey: request.auth.apiKeyKey,
      apiKeyValue: request.auth.apiKeyValue,
      apiKeyIn: request.auth.apiKeyIn,
    });
    sendWebSocketMessage(connectionInit(payload ?? {}));
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface-1/30">
      <div className="ui-panel-header flex-wrap gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-caption">
            {isSse ? "SSE" : isGraphqlWs ? "GraphQL WS" : "WebSocket"}
          </span>
          <Badge className={cn("font-mono capitalize text-[11px]", statusBadgeClass(ws.status))}>
            {ws.status}
          </Badge>
          {ws.handshakeStatus != null && (
            <Badge variant="outline" className="font-mono text-[11px]">
              Handshake {ws.handshakeStatus}
            </Badge>
          )}
          {ws.subprotocol && (
            <Badge variant="outline" className="font-mono text-[11px]" title="Sec-WebSocket-Protocol">
              {ws.subprotocol}
            </Badge>
          )}
          {isGraphqlWs && ws.status === "open" && (
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[11px]",
                ws.graphqlAcked
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 text-amber-800 dark:text-amber-200",
              )}
            >
              {ws.graphqlAcked ? "acked" : "awaiting ack"}
            </Badge>
          )}
          {isSse && ws.lastEventId && (
            <Badge variant="outline" className="font-mono text-[11px]" title="Last-Event-ID">
              id {ws.lastEventId}
            </Badge>
          )}
          {isSse && ws.lastRetryMs != null && (
            <Badge variant="outline" className="font-mono text-[11px]" title="SSE retry hint">
              retry {ws.lastRetryMs}ms
            </Badge>
          )}
          {ws.closeCode != null && (
            <Badge variant="outline" className="font-mono text-[11px]">
              Closed {ws.closeCode}
            </Badge>
          )}
          {isSse && ws.closeReason && !ws.closeCode && (
            <Badge variant="outline" className="font-mono text-[11px]">
              {ws.closeReason}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ws.handshakeHeaders && ws.handshakeHeaders.length > 0 && (
            <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
              <TabsList className="h-8">
                <TabsTrigger value="messages" className="text-xs">
                  Messages
                </TabsTrigger>
                <TabsTrigger value="handshake" className="text-xs">
                  Handshake
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {canConnect && (
            <Button type="button" size="sm" onClick={() => connectWebSocket()}>
              <Plug className="size-4" />
              Connect
            </Button>
          )}
          {canDisconnect && (
            <Button type="button" size="sm" variant="outline" onClick={() => disconnectWebSocket()}>
              <Unplug className="size-4" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {view === "handshake" && ws.handshakeHeaders ? (
        <ScrollAreaWithTop className="min-h-0 flex-1">
          <div className="divide-y divide-border p-4">
            {ws.handshakeHeaders.map((header) => (
              <div
                key={`${header.key}-${header.value}`}
                className="grid grid-cols-[220px_1fr] gap-4 py-2.5"
              >
                <span className="font-mono text-sm text-muted-foreground">{header.key}</span>
                <span className="break-all font-mono text-sm">{header.value}</span>
              </div>
            ))}
          </div>
        </ScrollAreaWithTop>
      ) : (
        <>
          {(isSse || isGraphqlWs) && ws.messages.length > 0 && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <Label htmlFor="stream-event-filter" className="shrink-0 text-xs text-muted-foreground">
                Filter
              </Label>
              <Input
                id="stream-event-filter"
                value={eventFilter}
                onChange={(event) => setEventFilter(event.target.value)}
                placeholder={
                  isSse
                    ? "e.g. message, ping, delta"
                    : "e.g. next, connection_ack, error"
                }
                className="h-8 max-w-xs font-mono text-xs"
              />
            </div>
          )}
          <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={ws.messages.length}>
            <div className="space-y-3 p-4">
              {ws.status === "connecting" && (
                <EmptyState
                  title="Connecting…"
                  description={
                    isSse
                      ? ws.lastEventId
                        ? `Resuming with Last-Event-ID: ${ws.lastEventId}`
                        : "Opening a text/event-stream connection with the configured URL, method, headers, and body."
                      : isGraphqlWs
                        ? "Negotiating graphql-transport-ws / graphql-ws and sending connection_init."
                        : "Performing WebSocket handshake with the configured URL and headers."
                  }
                />
              )}
              {ws.error && ws.status === "error" && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {ws.error}
                </div>
              )}
              {ws.messages.length === 0 && ws.status !== "connecting" && (
                <EmptyState
                  title="No messages yet"
                  description={
                    isSse
                      ? "Connect to receive server-sent events. Named events, ids, and retry hints show as badges. Reconnect sends Last-Event-ID."
                      : isGraphqlWs
                        ? "Connect, wait for connection_ack, then Subscribe. Use Complete to stop an active subscription."
                        : "Connect to the server, then send a message below."
                  }
                />
              )}
              {filteredMessages.length === 0 && ws.messages.length > 0 && (
                <EmptyState
                  title="No matching events"
                  description={`Nothing matches “${eventFilter.trim()}”. Clear the filter to see all events.`}
                />
              )}
              {filteredMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "rounded-lg border p-3",
                    message.direction === "incoming"
                      ? "border-border bg-muted/20"
                      : "border-primary/20 bg-primary/5",
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {message.direction === "incoming" ? (
                      <ArrowDownLeft className="size-3.5" />
                    ) : (
                      <ArrowUpRight className="size-3.5" />
                    )}
                    <span className="uppercase tracking-wide">{message.direction}</span>
                    {message.event && (
                      <Badge
                        variant="secondary"
                        className={cn("font-mono", frameBadgeClass(message.event))}
                      >
                        {message.event}
                      </Badge>
                    )}
                    {message.eventId && (
                      <Badge variant="outline" className="font-mono">
                        id {message.eventId}
                      </Badge>
                    )}
                    {message.retryMs != null && (
                      <Badge variant="outline" className="font-mono">
                        retry {message.retryMs}ms
                      </Badge>
                    )}
                    {message.binary && <Badge variant="secondary">binary</Badge>}
                    <span className="ml-auto font-mono">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                    {formatMessageData(message)}
                  </pre>
                </div>
              ))}
            </div>
          </ScrollAreaWithTop>

          {!isSse && (
          <div className="border-t border-border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ws-binary"
                  checked={sendBinary}
                  onCheckedChange={(checked) => setSendBinary(checked === true)}
                  disabled={ws.status !== "open"}
                />
                <Label htmlFor="ws-binary" className="text-sm text-muted-foreground">
                  Send as base64 binary
                </Label>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={ws.status !== "open"}
                onClick={() => sendWebSocketPing()}
              >
                <Radio className="size-4" />
                Ping
              </Button>
              {isGraphqlWs && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ws.status !== "open"}
                    onClick={sendConnectionInit}
                  >
                    Init
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ws.status !== "open"}
                    onClick={sendSubscribe}
                  >
                    Subscribe
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ws.status !== "open" || !activeSubscriptionId}
                    onClick={() => {
                      if (activeSubscriptionId) {
                        sendWebSocketMessage(graphqlComplete(activeSubscriptionId));
                      }
                    }}
                  >
                    Complete{activeSubscriptionId ? ` #${activeSubscriptionId}` : ""}
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  sendBinary
                    ? "Base64 payload"
                    : isGraphqlWs
                      ? '{"type":"ping"} or raw graphql-ws frame'
                      : 'Message payload, e.g. {"type":"ping"}'
                }
                className="font-mono text-sm"
                disabled={ws.status !== "open"}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && canSend) {
                    event.preventDefault();
                    sendWebSocketMessage(draft, sendBinary);
                    setDraft("");
                  }
                }}
              />
              <Button
                type="button"
                disabled={!canSend}
                onClick={() => {
                  sendWebSocketMessage(draft, sendBinary);
                  setDraft("");
                }}
              >
                Send
              </Button>
            </div>
          </div>
          )}
        </>
      )}
    </section>
  );
}
