import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useApp } from "@/machines";
import { CODE_SNIPPETS, requestToSnippet, type CodeSnippetId } from "@/lib/code-snippets";
import { resolveRequestForSend } from "@/lib/resolve-request";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CodeSnippetPanel() {
  const {
    request,
    collectionGroups,
    tabCollectionId,
    tabFolder,
    globals,
    activeEnvironment,
  } = useApp();
  const [lang, setLang] = useState<CodeSnippetId>("curl");
  const [copied, setCopied] = useState(false);

  const snippet = useMemo(() => {
    const collection =
      collectionGroups.find((group) => group.id === tabCollectionId) ?? null;
    const prepared = resolveRequestForSend({
      request,
      collection,
      folder: tabFolder,
      globals,
      environment: activeEnvironment,
    });
    return requestToSnippet(lang, prepared.request, prepared.environment);
  }, [
    activeEnvironment,
    collectionGroups,
    globals,
    lang,
    request,
    tabCollectionId,
    tabFolder,
  ]);

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Copied snippet");
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {CODE_SNIPPETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                lang === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => setLang(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void copy()}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="ui-code-block max-h-[min(480px,60vh)] overflow-auto text-[12px] leading-relaxed">
        {snippet}
      </pre>
    </div>
  );
}
