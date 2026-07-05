import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  ClipboardCopy,
  LoaderCircle,
  MoreHorizontal,
  Plug,
  Save,
  Send,
  Square,
  Unplug,
} from "lucide-react";
import { useApp } from "@/machines";
import { validateGraphqlRequest } from "@/lib/graphql";
import { isWebSocketProtocol } from "@/lib/protocol";
import { containsVariables, substituteVariables } from "@/lib/env";
import { methodTextClass } from "@/lib/method-colors";
import { VariableField } from "@/components/VariableField";
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
import { FolderSelect } from "@/components/FolderSelect";
import { requestToCurl, curlToRequest } from "@/lib/curl";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    openRequestTab,
    activeCollectionId,
    collectionGroups,
    setActiveCollectionId,
    activeEnvironment,
  } = useApp();

  const [saveFolder, setSaveFolder] = useState<string | undefined>();
  const curlImportRef = useRef<HTMLInputElement>(null);

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

  const resolvedUrl = useMemo(
    () => substituteVariables(request.url, activeEnvironment),
    [activeEnvironment, request.url],
  );

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
    <div className="request-bar shrink-0">
      <div className="flex items-stretch gap-2.5 px-3 py-2.5">
        <div className="request-url-composite">
          {isWebSocket ? (
            <div className="flex h-9 w-20 shrink-0 items-center justify-center border-r border-border bg-muted/30">
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
                  "h-9 w-24 shrink-0 rounded-none border-0 border-r bg-muted/30 font-mono text-xs font-bold shadow-none focus:ring-0",
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
          <VariableField
            embedded
            environment={activeEnvironment}
            className="min-w-0 flex-1"
            inputClassName="h-9 rounded-none border-0 bg-transparent font-mono text-[13px] shadow-none focus-visible:ring-0"
            value={request.url}
            onChange={(url) => updateRequest({ url })}
            placeholder={
              isWebSocket
                ? "wss://{{baseUrl}}/ws"
                : request.bodyKind === "graphql"
                  ? "{{baseUrl}}/graphql"
                  : "{{baseUrl}}/users"
            }
          />
        </div>

        {isWebSocket ? (
          ws.status === "open" || ws.status === "connecting" ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 px-4"
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
              className="h-9 shrink-0 px-5"
              disabled={!canConnect}
              onClick={() => connectWebSocket()}
            >
              <Plug />
              Connect
            </Button>
          )
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              className="h-9 shrink-0 rounded-xl px-5 shadow-md shadow-primary/20"
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
                className="h-9 px-3"
                onClick={cancelCurrentRequest}
              >
                <Square />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-topbar-border/50 px-3 py-1.5">
        <Input
          className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-2 text-[13px] shadow-none focus-visible:ring-0"
          value={request.name}
          onChange={(event) => updateRequest({ name: event.target.value })}
          placeholder="Request name"
        />
        <Select
          value={activeCollectionId ?? undefined}
          onValueChange={(value) => setActiveCollectionId(value)}
        >
          <SelectTrigger className="h-7 w-[132px] border-topbar-border/60 bg-background/60 text-xs">
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
        <FolderSelect
          collectionId={activeCollectionId}
          collectionGroups={collectionGroups}
          value={saveFolder}
          onChange={setSaveFolder}
          className="h-7 w-[120px] border-topbar-border/60 bg-background/60 text-xs"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7"
          onClick={() => saveCurrentToCollection(saveFolder)}
        >
          <Save className="size-3.5" />
          Save
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={async () => {
                const command = requestToCurl(request, activeEnvironment);
                await navigator.clipboard.writeText(command);
                toast.success("cURL copied to clipboard");
              }}
            >
              <ClipboardCopy className="size-4" />
              Copy as cURL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => curlImportRef.current?.click()}>
              <Braces className="size-4" />
              Import from cURL
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={curlImportRef}
          type="file"
          accept=".txt,.sh,text/plain"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then((raw) => {
              try {
                openRequestTab(curlToRequest(raw));
                toast.success("Imported request from cURL");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Invalid cURL command");
              }
            });
            event.target.value = "";
          }}
        />
      </div>

      {containsVariables(request.url) && (
        <p className="truncate border-t border-topbar-border/50 px-3 py-0.5 font-mono text-[11px] text-topbar-muted">
          <span className="text-topbar-foreground/60">Resolved · </span>
          {resolvedUrl}
        </p>
      )}
    </div>
  );
}
