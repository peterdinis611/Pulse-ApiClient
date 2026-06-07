import { useEffect, useMemo } from "react";
import { LoaderCircle, Plug, Plus, Save, Send, Square, Unplug } from "lucide-react";
import { useApp } from "@/machines";
import { getCollectionName } from "@/lib/collections";
import { validateGraphqlRequest } from "@/lib/graphql";
import { isWebSocketProtocol } from "@/lib/protocol";
import { methodTextClass } from "@/lib/method-colors";
import { cn } from "@/lib/utils";
import { HTTP_METHODS } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export function RequestBar() {
  const {
    request,
    loading,
    ws,
    cancelCurrentRequest,
    updateRequest,
    sendCurrentRequest,
    connectWebSocket,
    disconnectWebSocket,
    saveCurrentToCollection,
    newRequestTab,
    activeCollectionId,
    collectionGroups,
    setActiveCollectionId,
  } = useApp();

  const isWebSocket = isWebSocketProtocol(request.protocol);

  const canSend = useMemo(() => {
    if (!request.url.trim()) return false;
    if (isWebSocket) return false;
    if (request.bodyKind === "graphql") {
      return validateGraphqlRequest(request) === null;
    }
    return true;
  }, [isWebSocket, request]);

  const canConnect = useMemo(() => {
    if (!request.url.trim()) return false;
    return ws.status === "idle" || ws.status === "closed" || ws.status === "error";
  }, [request.url, ws.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (isWebSocket) {
          if (canConnect) connectWebSocket();
          return;
        }
        if (canSend) {
          void sendCurrentRequest();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canConnect, canSend, connectWebSocket, isWebSocket, sendCurrentRequest]);

  return (
    <div className="space-y-3 border-b border-border bg-background px-4 py-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={newRequestTab}>
          <Plus />
        </Button>
        <Input
          className="h-9 max-w-md border-transparent bg-transparent px-2 font-medium shadow-none focus-visible:ring-0"
          value={request.name}
          onChange={(event) => updateRequest({ name: event.target.value })}
          placeholder="Untitled request"
        />
        <Select
          value={activeCollectionId ?? undefined}
          onValueChange={(value) => setActiveCollectionId(value)}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Collection" />
          </SelectTrigger>
          <SelectContent>
            {collectionGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={saveCurrentToCollection}>
          <Save />
          Save to {getCollectionName(collectionGroups, activeCollectionId ?? "")}
        </Button>
      </div>

      <div className="flex overflow-hidden rounded-md border border-input bg-card shadow-sm">
        {isWebSocket ? (
          <div className="flex h-11 w-[108px] items-center justify-center border-r bg-muted/30 px-3">
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              WS
            </Badge>
          </div>
        ) : (
          <Select
            value={request.method}
            onValueChange={(value) =>
              updateRequest({ method: value as typeof request.method })
            }
          >
            <SelectTrigger
              className={cn(
                "h-11 w-[108px] rounded-none border-0 border-r bg-muted/30 font-mono text-xs font-bold shadow-none focus:ring-0",
                methodTextClass(request.method),
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((method) => (
                <SelectItem key={method} value={method} className={methodTextClass(method)}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          className="h-11 flex-1 rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
          value={request.url}
          onChange={(event) => updateRequest({ url: event.target.value })}
          placeholder={
            isWebSocket
              ? "wss://api.example.com/ws"
              : request.bodyKind === "graphql"
                ? "https://api.example.com/graphql"
                : "https://api.example.com/users"
          }
          spellCheck={false}
        />
        <Separator orientation="vertical" className="h-11" />
        {isWebSocket ? (
          ws.status === "open" || ws.status === "connecting" ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-none px-6"
              disabled={ws.status === "connecting"}
              onClick={() => disconnectWebSocket()}
            >
              {ws.status === "connecting" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Unplug />
              )}
              {ws.status === "connecting" ? "Connecting…" : "Disconnect"}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 rounded-none px-6"
              disabled={!canConnect}
              onClick={() => connectWebSocket()}
            >
              <Plug />
              Connect
            </Button>
          )
        ) : (
          <>
            <Button
              type="button"
              className="h-11 rounded-none px-6"
              disabled={loading || !canSend}
              onClick={() => void sendCurrentRequest()}
            >
              {loading ? <LoaderCircle className="animate-spin" /> : <Send />}
              {loading ? "Sending…" : "Send"}
            </Button>
            {loading && (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-none px-4"
                onClick={cancelCurrentRequest}
              >
                <Square />
                Cancel
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
