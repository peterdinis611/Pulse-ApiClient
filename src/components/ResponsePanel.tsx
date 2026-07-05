import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useApp } from "@/machines";
import { formatBytes, prettyJson } from "@/lib/helpers";
import { toast } from "@/lib/toast";
import { formatGraphqlResponse, parseGraphqlResponse } from "@/lib/graphql";
import { statusBadgeClass } from "@/lib/method-colors";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { TestResultsList } from "@/components/TestResultsList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/ui/panel";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ResponsePanel() {
  const { response, error, loading, testResults } = useApp();
  const [view, setView] = useState<"body" | "headers" | "tests">("body");

  const body = useMemo(() => {
    if (!response) return "";
    const ct = response.contentType ?? "";
    const graphql = parseGraphqlResponse(response.body);
    if (graphql) return formatGraphqlResponse(response.body);
    if (ct.includes("json")) return prettyJson(response.body);
    return response.body;
  }, [response]);

  const graphqlErrors = useMemo(() => parseGraphqlResponse(response?.body ?? "")?.errors ?? [], [response]);

  const scrollResetKey = useMemo(
    () => `${response?.requestId ?? "none"}-${response?.elapsedMs ?? 0}-${loading ? "loading" : "idle"}`,
    [loading, response?.elapsedMs, response?.requestId],
  );

  useEffect(() => {
    if (testResults && testResults.failed > 0) {
      setView("tests");
    }
  }, [testResults]);

  const copyBody = async () => {
    if (!body) return;
    await navigator.clipboard.writeText(body);
    toast.success("Copied to clipboard");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface-1/30">
      <PanelHeader
        label="Response"
        actions={
          response && !loading ? (
            <>
              {view === "body" && (
                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => void copyBody()}>
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              )}
              <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
                <TabsList className="h-8 border-0 bg-transparent">
                  <TabsTrigger value="body" className="h-7 px-2.5 text-xs">
                    Body
                  </TabsTrigger>
                  <TabsTrigger value="headers" className="h-7 px-2.5 text-xs">
                    Headers
                  </TabsTrigger>
                  <TabsTrigger value="tests" className="h-7 px-2.5 text-xs">
                    Tests
                    {testResults && testResults.failed > 0 && (
                      <span className="ml-1 text-destructive">!</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          ) : undefined
        }
      >
        {response && !loading && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn("font-mono text-[11px]", statusBadgeClass(response.status))}>
              {response.status} {response.statusText}
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px]">
              {response.fromCache ? "cached" : `${response.elapsedMs} ms`}
            </Badge>
            {response.fromCache && response.cacheAgeMs != null && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                age {response.cacheAgeMs} ms
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-[11px]">
              {formatBytes(response.sizeBytes)}
            </Badge>
            {response.contentType && (
              <Badge variant="secondary" className="max-w-[200px] truncate font-mono text-[11px]">
                {response.contentType}
              </Badge>
            )}
            {graphqlErrors.length > 0 && (
              <Badge className="border-destructive/30 bg-destructive/10 font-mono text-[11px] text-destructive">
                GraphQL {graphqlErrors.length} error{graphqlErrors.length === 1 ? "" : "s"}
              </Badge>
            )}
            {testResults && testResults.total > 0 && (
              <Badge
                className={cn(
                  "font-mono text-[11px]",
                  testResults.failed > 0
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "status-badge-success",
                )}
              >
                Tests {testResults.passed}/{testResults.total}
              </Badge>
            )}
          </div>
        )}
      </PanelHeader>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={scrollResetKey}>
        <div className="p-4">
          {loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-body text-muted-foreground">
              <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/3 animate-pulse bg-primary" />
              </div>
              Sending request…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-body font-medium text-destructive">Request failed</p>
              <p className="mt-1 text-body text-destructive/90">{error}</p>
            </div>
          )}

          {!loading && !error && !response && (
            <EmptyState
              title="No response yet"
              description="Hit Send or press ⌘ Enter to execute the request."
            />
          )}

          {!loading && response && view === "body" && (
            <pre className="ui-code-block">{body || "(empty body)"}</pre>
          )}

          {!loading && response && view === "headers" && (
            <div className="ui-panel divide-y divide-border/60">
              {response.headers.map((header) => (
                <div
                  key={`${header.key}-${header.value}`}
                  className="grid grid-cols-[200px_1fr] gap-4 px-4 py-2.5"
                >
                  <span className="font-mono text-[13px] text-muted-foreground">{header.key}</span>
                  <span className="break-all font-mono text-[13px] text-foreground">{header.value}</span>
                </div>
              ))}
            </div>
          )}

          {!loading && response && view === "tests" && (
            <>
              {testResults ? (
                <TestResultsList results={testResults} />
              ) : (
                <EmptyState
                  title="No test results"
                  description="Add tests in the Tests tab, send the request, then click Run tests."
                />
              )}
            </>
          )}
        </div>
      </ScrollAreaWithTop>
    </section>
  );
}
