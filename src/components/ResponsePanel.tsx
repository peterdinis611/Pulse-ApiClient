import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Send } from "lucide-react";
import { useApp } from "@/machines";
import { downloadBytes } from "@/lib/download";
import { formatBytes } from "@/lib/helpers";
import { toast } from "@/lib/toast";
import { parseGraphqlResponse } from "@/lib/graphql";
import { statusBadgeClass } from "@/lib/method-colors";
import {
  defaultResponseBodyFormat,
  decodeResponseBytes,
  formatResponseBody,
  responseMimeType,
  suggestedDownloadFilename,
  type ResponseBodyFormat,
} from "@/lib/response-body";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import {
  previewKindForResponse,
  ResponseMediaPreview,
} from "@/components/ResponseMediaPreview";
import { TestResultsList } from "@/components/TestResultsList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ResponsePanel() {
  const { response, error, loading, testResults } = useApp();
  const [view, setView] = useState<"body" | "headers" | "tests">("body");
  const [bodyFormat, setBodyFormat] = useState<ResponseBodyFormat>("pretty");

  const previewKind = useMemo(
    () => (response ? previewKindForResponse(response) : "text"),
    [response],
  );
  const isMediaPreview =
    previewKind === "image" || previewKind === "pdf" || previewKind === "excel";

  const formattedBody = useMemo(() => {
    if (!response) return { text: "", jsonValid: null as boolean | null };
    return formatResponseBody(response.body, response.contentType, bodyFormat);
  }, [bodyFormat, response]);

  const body = formattedBody.text;

  const graphqlErrors = useMemo(
    () =>
      response?.bodyEncoding === "base64"
        ? []
        : (parseGraphqlResponse(response?.body ?? "")?.errors ?? []),
    [response],
  );

  const scrollResetKey = useMemo(
    () =>
      `${response?.requestId ?? "none"}-${response?.elapsedMs ?? 0}-${bodyFormat}-${loading ? "loading" : "idle"}`,
    [bodyFormat, loading, response?.elapsedMs, response?.requestId],
  );

  useEffect(() => {
    if (!response) return;
    setBodyFormat(
      defaultResponseBodyFormat(response.body, response.contentType, response.bodyEncoding),
    );
  }, [response?.body, response?.bodyEncoding, response?.contentType, response?.requestId]);

  useEffect(() => {
    if (testResults && testResults.failed > 0) {
      setView("tests");
    }
  }, [testResults]);

  const copyBody = async () => {
    if (!response) return;
    if (response.bodyEncoding === "base64") {
      toast.info("Binary body", "Use Download to save the file.");
      return;
    }
    if (!body) return;
    await navigator.clipboard.writeText(body);
    toast.success("Copied to clipboard");
  };

  const downloadBody = () => {
    if (!response) return;
    const bytes = decodeResponseBytes(response);
    const mime = responseMimeType(response.contentType, previewKind);
    const filename = suggestedDownloadFilename(response.contentType, previewKind);
    downloadBytes(bytes, mime, filename);
    toast.success("Download started", filename);
  };

  const contentTypeShort = response?.contentType?.split(";")[0]?.trim() ?? null;

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface-1/30">
      <div className="response-toolbar">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="text-caption shrink-0">Response</span>
          {response && !loading && (
            <>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium",
                  statusBadgeClass(response.status),
                )}
              >
                {response.status}
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {response.statusText && (
                  <span className="mr-1.5 text-foreground/80">{response.statusText}</span>
                )}
                {response.fromCache ? "cached" : `${response.elapsedMs} ms`}
                {" · "}
                {formatBytes(response.sizeBytes)}
                {contentTypeShort && (
                  <span className="ml-1.5 text-muted-foreground/70">{contentTypeShort}</span>
                )}
              </span>
              {response.fromCache && response.cacheAgeMs != null && (
                <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
                  age {response.cacheAgeMs} ms
                </Badge>
              )}
              {graphqlErrors.length > 0 && (
                <Badge className="shrink-0 border-destructive/30 bg-destructive/10 font-mono text-[11px] text-destructive">
                  GraphQL {graphqlErrors.length} err
                </Badge>
              )}
              {testResults && testResults.total > 0 && (
                <Badge
                  className={cn(
                    "shrink-0 font-mono text-[11px]",
                    testResults.failed > 0
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "status-badge-success",
                  )}
                >
                  {testResults.passed}/{testResults.total} tests
                </Badge>
              )}
            </>
          )}
        </div>

        {response && !loading && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              onClick={() => void copyBody()}
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              onClick={downloadBody}
            >
              <Download className="size-3.5" />
              Download
            </Button>
            <div className="mx-1 h-4 w-px bg-border/60" />
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
          </div>
        )}
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={scrollResetKey}>
        <div className="p-4">
          {loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-body text-muted-foreground">
              <div className="h-1 w-44 overflow-hidden rounded-full bg-muted">
                <div className="response-loading-bar h-full w-1/3 rounded-full bg-primary" />
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
              icon={Send}
              title="Waiting for a response"
              description="Send with the button or press ⌘Enter. The body, headers, and tests will land here."
            />
          )}

          {!loading && response && view === "body" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Tabs
                  value={bodyFormat}
                  onValueChange={(value) => setBodyFormat(value as ResponseBodyFormat)}
                >
                  <TabsList className="h-7 border border-border/60 bg-muted/30">
                    {isMediaPreview && (
                      <TabsTrigger value="preview" className="h-6 px-2 text-xs">
                        Preview
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="pretty" className="h-6 px-2 text-xs">
                      Pretty
                    </TabsTrigger>
                    <TabsTrigger value="raw" className="h-6 px-2 text-xs">
                      Raw
                    </TabsTrigger>
                    {!isMediaPreview && (
                      <TabsTrigger value="json" className="h-6 px-2 text-xs">
                        JSON
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
                {bodyFormat === "json" && formattedBody.jsonValid === false && (
                  <span className="text-xs text-warning">Not valid JSON — showing raw text.</span>
                )}
              </div>

              {bodyFormat === "preview" && isMediaPreview ? (
                <ResponseMediaPreview response={response} kind={previewKind} />
              ) : (
                <pre className="ui-code-block">
                  {bodyFormat === "raw" && response.bodyEncoding === "base64"
                    ? `(base64, ${response.sizeBytes.toLocaleString()} bytes)\n${body.slice(0, 4000)}${body.length > 4000 ? "…" : ""}`
                    : body || "(empty body)"}
                </pre>
              )}
            </div>
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
