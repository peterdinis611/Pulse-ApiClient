import type { Environment, SavedRequest, TestRunResult } from "@/types";
import { createId } from "@/lib/helpers";
import { prepareRequest, runHttpTests, sendRequest, sendRequestsBatch } from "@/lib/http-client";

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

async function evaluateStep(
  saved: SavedRequest,
  environment: Environment | null,
  response?: Awaited<ReturnType<typeof sendRequest>>,
  error?: string,
): Promise<CollectionRunStep> {
  const step: CollectionRunStep = { saved, response, error };

  if (error) {
    step.testResults = {
      passed: 0,
      failed: 1,
      total: 1,
      results: [{ name: saved.name, passed: false, message: error }],
    };
    return step;
  }

  if (!response) return step;

  const prepared = prepareRequest(saved.request, environment);
  if (prepared.tests.trim()) {
    step.testResults = await runHttpTests(prepared.tests, response);
  }

  return step;
}

function tallyTests(result: CollectionRunResult, step: CollectionRunStep) {
  if (!step.testResults) return;
  result.passed += step.testResults.passed;
  result.failed += step.testResults.failed;
  result.totalTests += step.testResults.total;
}

export async function runCollection(
  collectionId: string,
  collectionName: string,
  requests: SavedRequest[],
  environment: Environment | null,
  onStep?: (step: CollectionRunStep, index: number, total: number) => void,
): Promise<CollectionRunResult> {
  const result: CollectionRunResult = {
    collectionId,
    collectionName,
    passed: 0,
    failed: 0,
    totalTests: 0,
    steps: [],
  };

  for (let index = 0; index < requests.length; index += 1) {
    const saved = requests[index];
    let step: CollectionRunStep = { saved };

    try {
      const prepared = prepareRequest(saved.request, environment);
      const response = await sendRequest(prepared, environment, {
        requestId: createId("collection"),
      });
      step = await evaluateStep(saved, environment, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      step = await evaluateStep(saved, environment, undefined, message);
      result.failed += 1;
      result.totalTests += 1;
    }

    tallyTests(result, step);
    result.steps.push(step);
    onStep?.(step, index, requests.length);
  }

  return result;
}

export async function runCollectionParallel(
  collectionId: string,
  collectionName: string,
  requests: SavedRequest[],
  environment: Environment | null,
  onStep?: (step: CollectionRunStep, index: number, total: number) => void,
): Promise<CollectionRunResult> {
  const result: CollectionRunResult = {
    collectionId,
    collectionName,
    passed: 0,
    failed: 0,
    totalTests: 0,
    steps: [],
  };

  const batch = await sendRequestsBatch(
    requests.map((saved) => ({
      request: saved.request,
      environment,
      requestId: createId("collection"),
    })),
  );

  for (let index = 0; index < requests.length; index += 1) {
    const saved = requests[index];
    const item = batch[index];
    const step = await evaluateStep(saved, environment, item?.response, item?.error);
    if (item?.error) {
      result.failed += 1;
      result.totalTests += 1;
    }
    tallyTests(result, step);
    result.steps.push(step);
    onStep?.(step, index, requests.length);
  }

  return result;
}
