import { Effect } from "effect";
import type { Environment, SavedRequest, TestRunResult } from "@/types";
import { createId } from "@/lib/helpers";
import { applyEnvironmentMutations } from "@/lib/env";
import { runEffectsParallel } from "@/lib/effect/tauri";
import { runEffect } from "@/lib/effect/run";
import { runHttpTestsEffect, runPreRequestScriptEffect } from "@/lib/http-ipc";
import { sendRequest, sendRequestsBatch } from "@/lib/http-client";

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

function failureTestResults(name: string, message: string): TestRunResult {
  return {
    passed: 0,
    failed: 1,
    total: 1,
    results: [{ name, passed: false, message }],
  };
}

function evaluateStepEffect(
  saved: SavedRequest,
  _environment: Environment | null,
  response?: Awaited<ReturnType<typeof sendRequest>>,
  error?: string,
): Effect.Effect<CollectionRunStep, never> {
  if (error) {
    return Effect.succeed({
      saved,
      response,
      error,
      testResults: failureTestResults(saved.name, error),
    });
  }

  if (!response) {
    return Effect.succeed({ saved, response, error });
  }

  const prepared = saved.request;
  if (!prepared.tests.trim()) {
    return Effect.succeed({ saved, response, error });
  }

  return runHttpTestsEffect(prepared.tests, response).pipe(
    Effect.map((testResults) => ({ saved, response, error, testResults })),
    Effect.catchAll((cause) =>
      Effect.succeed({
        saved,
        response,
        error,
        testResults: failureTestResults(
          saved.name,
          cause instanceof Error ? cause.message : String(cause),
        ),
      }),
    ),
  );
}

function tallyTests(result: CollectionRunResult, step: CollectionRunStep) {
  if (!step.testResults) return;
  result.passed += step.testResults.passed;
  result.failed += step.testResults.failed;
  result.totalTests += step.testResults.total;
}

async function evaluateStepsParallel(
  requests: SavedRequest[],
  environment: Environment | null,
  batch: Array<{ response?: Awaited<ReturnType<typeof sendRequest>>; error?: string }>,
): Promise<CollectionRunStep[]> {
  return runEffect(
    runEffectsParallel(
      requests.map((saved, index) => {
        const item = batch[index];
        return evaluateStepEffect(saved, environment, item?.response, item?.error);
      }),
      "unbounded",
    ),
  );
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

  let activeEnvironment = environment;

  for (let index = 0; index < requests.length; index += 1) {
    const saved = requests[index];
    let step: CollectionRunStep = { saved };

    try {
      const script = saved.request.preRequestScript?.trim() ?? "";
      if (script && activeEnvironment) {
        const pre = await runEffect(runPreRequestScriptEffect(script));
        if (pre.mutations.length > 0) {
          activeEnvironment = applyEnvironmentMutations(activeEnvironment, pre.mutations);
        }
      }

      const response = await sendRequest(saved.request, activeEnvironment, {
        requestId: createId("collection"),
      });
      [step] = await evaluateStepsParallel([saved], activeEnvironment, [{ response }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      [step] = await evaluateStepsParallel([saved], activeEnvironment, [{ error: message }]);
      result.failed += 1;
      result.totalTests += 1;
    }

    tallyTests(result, step);
    result.steps.push(step);
    onStep?.(step, index, requests.length);
  }

  return result;
}

/** Prefer sequential when any step has a pre-request script so env.set can chain. */
export async function runCollectionAuto(
  collectionId: string,
  collectionName: string,
  requests: SavedRequest[],
  environment: Environment | null,
  onStep?: (step: CollectionRunStep, index: number, total: number) => void,
): Promise<CollectionRunResult> {
  const needsSequential = requests.some((item) => item.request.preRequestScript?.trim());
  if (needsSequential) {
    return runCollection(collectionId, collectionName, requests, environment, onStep);
  }
  return runCollectionParallel(collectionId, collectionName, requests, environment, onStep);
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

  const steps = await evaluateStepsParallel(requests, environment, batch);

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (step.error) {
      result.failed += 1;
      result.totalTests += 1;
    }
    tallyTests(result, step);
    result.steps.push(step);
    onStep?.(step, index, requests.length);
  }

  return result;
}
