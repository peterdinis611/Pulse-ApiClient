import { useState } from "react";
import { BookOpen, FlaskConical, Play, Plus } from "lucide-react";
import { useApp } from "@/machines";
import { runHttpTests } from "@/lib/http-client";
import {
  pulseTestApiReference,
  pulseTestsTemplate,
  snippetsByGroup,
} from "@/lib/test-snippets";
import { toast } from "@/lib/toast";
import { TestResultsList } from "@/components/TestResultsList";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TestRunResult } from "@/types";

export function TestsTabPanel() {
  const { request, response, loading, testResults, updateRequest, setTestResults } = useApp();
  const [previewResults, setPreviewResults] = useState<TestRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);

  const activeResults = previewResults ?? testResults;
  const canRun = Boolean(response && !loading && request.tests.trim());
  const snippetGroups = snippetsByGroup();

  const insertSnippet = (code: string) => {
    const next = request.tests.trim()
      ? `${request.tests.trim()}\n\n${code}`
      : code;
    updateRequest({ tests: next });
  };

  const handleRunTests = async () => {
    if (!response || !request.tests.trim()) return;
    setRunning(true);
    setRunError(null);
    try {
      const results = await runHttpTests(request.tests, response);
      setPreviewResults(results);
      setTestResults(results);
      if (results.total === 0) {
        toast.info("No tests to run");
      } else if (results.failed > 0) {
        toast.error("Tests failed", `${results.failed} of ${results.total} failed`);
      } else {
        toast.success("All tests passed", `${results.passed}/${results.total}`);
      }
    } catch {
      setRunError("Failed to run tests.");
      toast.error("Failed to run tests");
    } finally {
      setRunning(false);
    }
  };

  const handleUseTemplate = () => {
    if (request.tests.trim() && !window.confirm("Replace current tests with template?")) {
      return;
    }
    updateRequest({ tests: pulseTestsTemplate });
    toast.success("Test template applied");
  };

  return (
    <div className="grid min-h-[420px] grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
      <div className="flex min-h-0 flex-col space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Test script</p>
            <p className="text-xs text-muted-foreground">
              Write <code className="rounded bg-muted px-1">pulse.test</code> blocks to validate
              responses. Use <code className="rounded bg-muted px-1">{"{{var}}"}</code> in requests,
              then assert on <code className="rounded bg-muted px-1">pulse.response</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowReference((open) => !open)}
            >
              <BookOpen className="size-3.5" />
              API reference
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleUseTemplate}>
              Use template
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canRun || running}
              onClick={() => void handleRunTests()}
            >
              <Play className="size-3.5" />
              {running ? "Running…" : "Run tests"}
            </Button>
          </div>
        </div>

        {showReference && (
          <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2">
            {pulseTestApiReference.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-foreground/90">
                  {section.items.map((item) => (
                    <li key={item} className="font-mono leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <Textarea
          value={request.tests}
          onChange={(event) => updateRequest({ tests: event.target.value })}
          spellCheck={false}
          className="min-h-[360px] flex-1 font-mono text-sm"
          placeholder={pulseTestsTemplate}
        />
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <FlaskConical className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Snippets</p>
          </div>
          <div className="max-h-[320px] space-y-3 overflow-auto pr-1">
            {snippetGroups.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((snippet) => (
                    <Button
                      key={snippet.id}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-auto justify-start px-2 py-1.5 text-left"
                      title={snippet.description}
                      onClick={() => insertSnippet(snippet.code)}
                    >
                      <Plus className="size-3.5 shrink-0" />
                      <span className="text-xs">{snippet.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium">Test results</p>
          {!response && (
            <p className="text-sm text-muted-foreground">
              Send the request first, then run tests on the response.
            </p>
          )}
          {response && !activeResults && (
            <p className="text-sm text-muted-foreground">
              No results yet. Send the request or click Run tests.
            </p>
          )}
          {runError && <p className="mb-2 text-sm text-destructive">{runError}</p>}
          {activeResults && (
            <div
              className={cn(
                "max-h-[280px] overflow-auto",
                activeResults.failed > 0 && "rounded-md",
              )}
            >
              <TestResultsList results={activeResults} compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
