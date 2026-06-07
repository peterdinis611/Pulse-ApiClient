import type { Environment, SavedRequest, TestRunResult } from "@/types";
import { createId } from "@/lib/helpers";
import { prepareRequest, runHttpTests, sendRequest } from "@/lib/http-client";

export type CollectionRunStep = {
  saved: SavedRequest;
  response?: Awaited<ReturnType<typeof sendRequest>>;
  error?: string;
  testResults?: TestRunResult | null;
};

export type CollectionRunResult = {
  collectionId: string;
  collectionName: string;
  passed: number;
  failed: number;
  totalTests: number;
  steps: CollectionRunStep[];
};

export async function runCollection(
  collectionId: string,
  collectionName: string,
  requests: SavedRequest[],
  environment: Environment | null,
  onStep?: (step: CollectionRunStep, index: number, total: number) => void,
): Promise<CollectionRunResult> {
  const steps: CollectionRunStep[] = [];
  let passed = 0;
  let failed = 0;
  let totalTests = 0;

  for (let index = 0; index < requests.length; index += 1) {
    const saved = requests[index];
    const step: CollectionRunStep = { saved };

    try {
      const prepared = prepareRequest(saved.request, environment);
      const response = await sendRequest(prepared, environment, {
        requestId: createId("collection"),
      });
      step.response = response;

      if (prepared.tests.trim()) {
        step.testResults = await runHttpTests(prepared.tests, response);
        passed += step.testResults.passed;
        failed += step.testResults.failed;
        totalTests += step.testResults.total;
      }
    } catch (error) {
      step.error = error instanceof Error ? error.message : String(error);
      failed += 1;
      totalTests += 1;
      step.testResults = {
        passed: 0,
        failed: 1,
        total: 1,
        results: [
          {
            name: saved.name,
            passed: false,
            message: step.error,
          },
        ],
      };
    }

    steps.push(step);
    onStep?.(step, index, requests.length);
  }

  return {
    collectionId,
    collectionName,
    passed,
    failed,
    totalTests,
    steps,
  };
}
