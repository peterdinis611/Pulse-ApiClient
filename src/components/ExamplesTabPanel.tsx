import { Bookmark, Trash2 } from "lucide-react";
import { useApp } from "@/machines";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { statusBadgeClass } from "@/lib/method-colors";
import { formatBytes } from "@/lib/helpers";
import { cn } from "@/lib/utils";

export function ExamplesTabPanel() {
  const { request, loadResponseExample, deleteResponseExample } = useApp();
  const examples = request.examples ?? [];

  if (examples.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="No saved examples"
        description="After a send, use Save example in the response panel. The snapshot stays on this request so you can see how a 200 should look — no Swagger required."
      />
    );
  }

  return (
    <div className="space-y-2">
      {examples.map((example) => (
        <div
          key={example.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface-1/50 px-3 py-2.5"
        >
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => loadResponseExample(example.id)}
          >
            <p className="truncate text-sm font-medium">{example.name}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 font-medium",
                  statusBadgeClass(example.response.status),
                )}
              >
                {example.response.status}
              </span>
              <span>{example.response.statusText}</span>
              <span>· {formatBytes(example.response.sizeBytes)}</span>
              <span>· {new Date(example.savedAt).toLocaleString()}</span>
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => loadResponseExample(example.id)}>
              Load
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              aria-label="Delete example"
              onClick={() => deleteResponseExample(example.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
