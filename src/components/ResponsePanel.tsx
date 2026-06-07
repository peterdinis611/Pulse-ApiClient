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
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Response
        </span>

        {response && !loading && (
          <>
            <Badge className={cn("font-mono", statusBadgeClass(response.status))}>
              {response.status} {response.statusText}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {response.fromCache ? "cached" : `${response.elapsedMs} ms`}
            </Badge>
            {response.fromCache && response.cacheAgeMs != null && (
              <Badge variant="secondary" className="font-mono">
                age {response.cacheAgeMs} ms
              </Badge>
            )}
            <Badge variant="outline" className="font-mono">
              {formatBytes(response.sizeBytes)}
            </Badge>
            {response.contentType && (
              <Badge variant="secondary" className="max-w-[220px] truncate font-mono">
                {response.contentType}
              </Badge>
            )}
            {graphqlErrors.length > 0 && (
              <Badge className="border-destructive/30 bg-destructive/10 font-mono text-destructive">
                GraphQL {graphqlErrors.length} error{graphqlErrors.length === 1 ? "" : "s"}
              </Badge>
            )}
            {testResults && testResults.total > 0 && (
              <Badge
                className={cn(
                  "font-mono",
                  testResults.failed > 0
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                )}
              >
                Tests {testResults.passed}/{testResults.total}
              </Badge>
            )}
          </>
        )}

        {response && !loading && (
          <div className="ml-auto flex items-center gap-2">
            {view === "body" && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void copyBody()}>
                <Copy />
                Copy
              </Button>
            )}
            <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
              <TabsList className="h-8">
                <TabsTrigger value="body" className="text-xs">
                  Body
                </TabsTrigger>
                <TabsTrigger value="headers" className="text-xs">
                  Headers
                </TabsTrigger>
                <TabsTrigger value="tests" className="text-xs">
                  Test Results
                  {testResults && testResults.failed > 0 && (
                    <span className="ml-1 text-destructive">!</span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={scrollResetKey}>
        <div className="p-4">
          {loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/3 animate-pulse bg-primary" />
              </div>
              Sending request…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">Request failed</p>
              <p className="mt-1 text-sm text-destructive/90">{error}</p>
            </div>
          )}

          {!loading && !error && !response && (
            <EmptyState
              title="No response yet"
              description="Hit Send or press ⌘ Enter to execute the request."
            />
          )}

          {!loading && response && view === "body" && (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed text-foreground">
              {body || "(empty body)"}
            </pre>
          )}

          {!loading && response && view === "headers" && (
            <div className="divide-y divide-border rounded-md border border-border">
              {response.headers.map((header) => (
                <div
                  key={`${header.key}-${header.value}`}
                  className="grid grid-cols-[220px_1fr] gap-4 px-4 py-2.5"
                >
                  <span className="font-mono text-sm text-muted-foreground">{header.key}</span>
                  <span className="break-all font-mono text-sm text-foreground">{header.value}</span>
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
