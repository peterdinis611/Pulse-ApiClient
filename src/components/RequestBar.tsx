import { useEffect, useMemo } from "react";
import { LoaderCircle, Plus, Save, Send, Square } from "lucide-react";
import { useApp } from "@/machines";
import { getCollectionName } from "@/lib/collections";
import { validateGraphqlRequest } from "@/lib/graphql";
import { methodTextClass } from "@/lib/method-colors";
import { cn } from "@/lib/utils";
import { HTTP_METHODS } from "@/types";
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
    cancelCurrentRequest,
    updateRequest,
    sendCurrentRequest,
    saveCurrentToCollection,
    newRequestTab,
    activeCollectionId,
    collectionGroups,
    setActiveCollectionId,
  } = useApp();

  const canSend = useMemo(() => {
    if (!request.url.trim()) return false;
    if (request.bodyKind === "graphql") {
      return validateGraphqlRequest(request) === null;
    }
    return true;
  }, [request]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (canSend) {
          void sendCurrentRequest();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSend, sendCurrentRequest]);

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
        <Input
          className="h-11 flex-1 rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
          value={request.url}
          onChange={(event) => updateRequest({ url: event.target.value })}
          placeholder={
            request.bodyKind === "graphql"
              ? "https://api.example.com/graphql"
              : "https://api.example.com/users"
          }
          spellCheck={false}
        />
        <Separator orientation="vertical" className="h-11" />
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
      </div>
    </div>
  );
}
