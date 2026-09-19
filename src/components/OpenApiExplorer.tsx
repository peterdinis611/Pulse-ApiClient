import { useMemo, useRef, useState } from "react";
import { BookOpen, LoaderCircle } from "lucide-react";
import { useApp } from "@/machines";
import { listOpenApiOperations } from "@/lib/openapi-import";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { methodClass } from "@/lib/helpers";
import { cn } from "@/lib/utils";

export function OpenApiExplorer({ onClose }: { onClose?: () => void }) {
  const { openRequestTab, setMainView } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const operations = useMemo(() => {
    if (!raw.trim()) return [];
    try {
      return listOpenApiOperations(raw);
    } catch {
      return [];
    }
  }, [raw]);

  const visible = operations.filter((op) => {
    if (!query.trim()) return true;
    const hay = `${op.method} ${op.path} ${op.summary}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  const loadUrl = async () => {
    if (!url.trim()) {
      toast.error("Enter a spec URL");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(url.trim());
      const text = await response.text();
      listOpenApiOperations(text);
      setRaw(text);
      toast.success("Spec loaded", `${listOpenApiOperations(text).length} operations`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not fetch spec");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 border-b border-sidebar-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">OpenAPI explorer</p>
          <p className="text-xs text-muted-foreground">
            Fetch a spec, then click an operation to open it as a request. Saving writes YAML when a Git folder is attached.
          </p>
        </div>
        {onClose && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…/openapi.json"
          className="h-8 font-mono text-[12px]"
        />
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void loadUrl()}>
          {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
          Fetch
        </Button>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          Open file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then((text) => {
              try {
                listOpenApiOperations(text);
                setRaw(text);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Not an OpenAPI spec");
              }
            });
          }}
        />
        {operations.length > 0 && (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter operations"
            className="h-8 text-[12px]"
          />
        )}
      </div>
      {visible.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-auto">
          {visible.map((op) => (
            <li key={`${op.method}:${op.path}:${op.summary}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent"
                onClick={() => {
                  setMainView("request");
                  openRequestTab(op.request);
                }}
              >
                <span className={cn("w-14 shrink-0 font-mono text-[10px] font-semibold", methodClass(op.method))}>
                  {op.method}
                </span>
                <span className="min-w-0 truncate font-mono text-[11px]">{op.path}</span>
                <span className="ml-auto max-w-[40%] truncate text-[11px] text-muted-foreground">{op.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
