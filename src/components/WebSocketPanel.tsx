import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plug, Radio, Unplug } from "lucide-react";
import { useApp } from "@/machines";
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
import type { WebSocketMessage } from "@/types";

function formatMessageData(message: WebSocketMessage): string {
  if (message.binary) {
    return `[binary] ${message.data}`;
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
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "connecting":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

export function WebSocketPanel() {
  const { ws, connectWebSocket, disconnectWebSocket, sendWebSocketMessage, sendWebSocketPing } =
    useApp();
  const [draft, setDraft] = useState('{"type":"ping"}');
  const [sendBinary, setSendBinary] = useState(false);
  const [view, setView] = useState<"messages" | "handshake">("messages");

  useEffect(() => {
    if (ws.status === "open") {
      setView("messages");
    }
  }, [ws.status]);

  const canConnect = ws.status === "idle" || ws.status === "closed" || ws.status === "error";
  const canDisconnect = ws.status === "open" || ws.status === "connecting";
  const canSend = ws.status === "open" && draft.trim().length > 0;

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          WebSocket
        </span>
        <Badge className={cn("font-mono capitalize", statusBadgeClass(ws.status))}>{ws.status}</Badge>
        {ws.handshakeStatus != null && (
          <Badge variant="outline" className="font-mono">
            Handshake {ws.handshakeStatus}
          </Badge>
        )}
        {ws.closeCode != null && (
          <Badge variant="outline" className="font-mono">
            Closed {ws.closeCode}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
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
          <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={ws.messages.length}>
            <div className="space-y-3 p-4">
              {ws.status === "connecting" && (
                <EmptyState
                  title="Connecting…"
                  description="Performing WebSocket handshake with the configured URL and headers."
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
                  description="Connect to the server, then send a message below."
                />
              )}
              {ws.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "rounded-lg border p-3",
                    message.direction === "incoming"
                      ? "border-border bg-muted/20"
                      : "border-primary/20 bg-primary/5",
                  )}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    {message.direction === "incoming" ? (
                      <ArrowDownLeft className="size-3.5" />
                    ) : (
                      <ArrowUpRight className="size-3.5" />
                    )}
                    <span className="uppercase tracking-wide">{message.direction}</span>
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
            </div>
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  sendBinary
                    ? "Base64 payload"
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
        </>
      )}
    </section>
  );
}
