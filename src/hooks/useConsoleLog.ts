import { useCallback, useEffect, useRef, useState } from "react";
import type { HttpResponse, TestRunResult } from "@/types";
import { createId } from "@/lib/helpers";

export type ConsoleEntryKind = "info" | "success" | "error" | "input" | "output";

export type ConsoleEntry = {
  id: string;
  kind: ConsoleEntryKind;
  text: string;
  at: number;
};

type TabSnapshot = {
  loading: boolean;
  error: string | null;
  responseKey: string | null;
  testResultsKey: string | null;
};

function responseKey(response: HttpResponse | null): string | null {
  if (!response) return null;
  return `${response.status}-${response.elapsedMs}-${response.requestId ?? response.body.length}`;
}

function testResultsKey(results: TestRunResult | null): string | null {
  if (!results || results.total === 0) return null;
  return results.results.map((result) => `${result.name}:${result.passed}:${result.message ?? ""}`).join("|");
}

export function useConsoleLog(options: {
  tabId: string;
  loading: boolean;
  error: string | null;
  response: HttpResponse | null;
  testResults: TestRunResult | null;
}) {
  const { tabId, loading, error, response, testResults } = options;
  const entriesByTab = useRef<Record<string, ConsoleEntry[]>>({});
  const snapshotByTab = useRef<Record<string, TabSnapshot>>({});
  const activeTabIdRef = useRef(tabId);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);

  activeTabIdRef.current = tabId;

  const persist = useCallback((targetTabId: string, next: ConsoleEntry[]) => {
    entriesByTab.current[targetTabId] = next;
    if (targetTabId === activeTabIdRef.current) {
      setEntries(next);
    }
  }, []);

  const append = useCallback(
    (targetTabId: string, kind: ConsoleEntryKind, text: string) => {
      const current = entriesByTab.current[targetTabId] ?? [];
      persist(targetTabId, [
        ...current,
        { id: createId("clog"), kind, text, at: Date.now() },
      ]);
    },
    [persist],
  );

  const appendMany = useCallback(
    (targetTabId: string, items: Array<{ kind: ConsoleEntryKind; text: string }>) => {
      const current = entriesByTab.current[targetTabId] ?? [];
      persist(targetTabId, [
        ...current,
        ...items.map((item) => ({
          id: createId("clog"),
          kind: item.kind,
          text: item.text,
          at: Date.now(),
        })),
      ]);
    },
    [persist],
  );

  useEffect(() => {
    setEntries(entriesByTab.current[tabId] ?? []);
  }, [tabId]);

  useEffect(() => {
    const snapshot = snapshotByTab.current[tabId] ?? {
      loading: false,
      error: null,
      responseKey: null,
      testResultsKey: null,
    };
    const nextSnapshot = { ...snapshot };
    const pending: Array<{ kind: ConsoleEntryKind; text: string }> = [];

    if (loading && !snapshot.loading) {
      pending.push({ kind: "info", text: "→ Sending request…" });
    }

    if (error && error !== snapshot.error) {
      pending.push({ kind: "error", text: `✕ ${error}` });
      nextSnapshot.error = error;
    } else if (!error) {
      nextSnapshot.error = null;
    }

    const currentResponseKey = responseKey(response);
    if (currentResponseKey && currentResponseKey !== snapshot.responseKey && !loading) {
      const cacheLabel = response?.fromCache ? " (cached)" : "";
      pending.push({
        kind: "success",
        text: `✓ ${response!.status} ${response!.statusText} · ${response!.elapsedMs} ms${cacheLabel}`,
      });
      nextSnapshot.responseKey = currentResponseKey;
    }

    const currentTestKey = testResultsKey(testResults);
    if (currentTestKey && currentTestKey !== snapshot.testResultsKey && !loading) {
      const failed = testResults!.failed;
      pending.push({
        kind: failed > 0 ? "error" : "success",
        text: `${failed > 0 ? "✕" : "✓"} Tests ${testResults!.passed}/${testResults!.total} passed`,
      });
      for (const result of testResults!.results) {
        if (!result.passed) {
          pending.push({
            kind: "error",
            text: `  ✕ ${result.name}${result.message ? `: ${result.message}` : ""}`,
          });
        }
      }
      nextSnapshot.testResultsKey = currentTestKey;
    }

    nextSnapshot.loading = loading;
    snapshotByTab.current[tabId] = nextSnapshot;

    if (pending.length > 0) {
      appendMany(tabId, pending);
    }
  }, [tabId, loading, error, response, testResults, appendMany]);

  const clearConsole = useCallback(() => {
    persist(tabId, []);
    snapshotByTab.current[tabId] = {
      loading,
      error,
      responseKey: responseKey(response),
      testResultsKey: testResultsKey(testResults),
    };
  }, [tabId, loading, error, response, testResults, persist]);

  const logInput = useCallback(
    (text: string) => append(tabId, "input", `> ${text}`),
    [tabId, append],
  );

  const logOutput = useCallback(
    (text: string, kind: ConsoleEntryKind = "output") => append(tabId, kind, text),
    [tabId, append],
  );

  return { entries, clearConsole, logInput, logOutput };
}
