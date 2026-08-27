import { Effect } from "effect";
import { resolveRequestForSend } from "./resolve-request";
import type { CollectionGroup, Environment, KeyValue, SavedRequest, TestRunResult } from "@/types";
import { createId } from "@/lib/helpers";
import { applyEnvironmentMutations } from "@/lib/env";
import { runEffectsParallel } from "@/lib/effect/tauri";
import { runEffect } from "@/lib/effect/run";
import { runHttpTestsEffect, runPreRequestScriptEffect } from "@/lib/http-ipc";
import { sendRequest, sendRequestsBatch } from "@/lib/http-client";
import type { RunnerDataRow } from "@/lib/runner-data";

export type CollectionRunStep = {
  saved: SavedRequest;
  response?: Awaited<ReturnType<typeof sendRequest>>;
  error?: string;
  testResults?: TestRunResult | null;
  iteration?: number;
};

export type CollectionRunResult = {
  collectionId: string;
  collectionName: string;
  passed: number;
  failed: number;
  totalTests: number;
  steps: CollectionRunStep[];
  folderPath?: string;
  dataFileName?: string;
  iterations: number;
};

export type CollectionRunExtras = {
  collection?: CollectionGroup | null;
  globals?: KeyValue[];
  dataRows?: RunnerDataRow[];
  dataFileName?: string;
  folderPath?: string;
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

function emptyResult(
  collectionId: string,
  collectionName: string,
  extras?: CollectionRunExtras,
  iterations = 1,
): CollectionRunResult {
  return {
    collectionId,
    collectionName,
    passed: 0,
    failed: 0,
    totalTests: 0,
    steps: [],
    folderPath: extras?.folderPath,
    dataFileName: extras?.dataFileName,
    iterations,
  };
}

function environmentWithDataRow(
  environment: Environment | null,
  row: RunnerDataRow | null,
): Environment | null {
  if (!row) return environment;
  const base = environment ?? { id: "runner-data", name: "Data file", variables: [] };
  return applyEnvironmentMutations(
    base,
    Object.entries(row).map(([key, value]) => ({ key, value })),
  );
}

export async function runCollection(
  collectionId: string,
  collectionName: string,
  requests: SavedRequest[],
  environment: Environment | null,
  onStep?: (step: CollectionRunStep, index: number, total: number) => void,
  extras?: CollectionRunExtras,
): Promise<CollectionRunResult> {
  const rows = extras?.dataRows?.length ? extras.dataRows : [null];
  const result = emptyResult(collectionId, collectionName, extras, rows.length);
  const totalSends = Math.max(1, requests.length) * rows.length;
  let sendIndex = 0;
  let activeEnvironment = environment;

  for (let iteration = 0; iteration < rows.length; iteration += 1) {
    activeEnvironment = environmentWithDataRow(activeEnvironment, rows[iteration] ?? null);

    for (const saved of requests) {
      let step: CollectionRunStep = { saved };

      try {
        const prepared = resolveRequestForSend({
          request: saved.request,
          collection: extras?.collection,
          folder: saved.folder,
          globals: extras?.globals,
          environment: activeEnvironment,
        });
        const script = prepared.request.preRequestScript?.trim() ?? "";
        if (script && activeEnvironment) {
          const pre = await runEffect(runPreRequestScriptEffect(script));
          if (pre.mutations.length > 0) {
            activeEnvironment = applyEnvironmentMutations(activeEnvironment, pre.mutations);
          }
        }

        const sendPrepared = resolveRequestForSend({
          request: saved.request,
          collection: extras?.collection,
          folder: saved.folder,
          globals: extras?.globals,
          environment: activeEnvironment,
        });
        const response = await sendRequest(sendPrepared.request, sendPrepared.environment, {
          requestId: createId("collection"),
        });
        [step] = await evaluateStepsParallel([saved], activeEnvironment, [{ response }]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
      [step] = await evaluateStepsParallel([saved], activeEnvironment, [{ error: message }]);
    }

      if (rows.length > 1) {
        step = { ...step, iteration: iteration + 1 };
      }

      tallyTests(result, step);
      result.steps.push(step);
      onStep?.(step, sendIndex, totalSends);
      sendIndex += 1;
    }
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
  extras?: CollectionRunExtras,
): Promise<CollectionRunResult> {
  const needsSequential =
    Boolean(extras?.dataRows?.length)
    || requests.some((item) => item.request.preRequestScript?.trim())
    || Boolean(extras?.collection?.preRequestScript?.trim())
    || Boolean(extras?.collection?.folderConfigs?.some((item) => item.preRequestScript?.trim()));
  if (needsSequential) {
    return runCollection(collectionId, collectionName, requests, environment, onStep, extras);
  }
  return runCollectionParallel(collectionId, collectionName, requests, environment, onStep, extras);
}

export async function runCollectionParallel(
  collectionId: string,
  collectionName: string,
  requests: SavedRequest[],
  environment: Environment | null,
  onStep?: (step: CollectionRunStep, index: number, total: number) => void,
  extras?: CollectionRunExtras,
): Promise<CollectionRunResult> {
  const result = emptyResult(collectionId, collectionName, extras, 1);

  const batch = await sendRequestsBatch(
    requests.map((saved) => {
      const prepared = resolveRequestForSend({
        request: saved.request,
        collection: extras?.collection,
        folder: saved.folder,
        globals: extras?.globals,
        environment,
      });
      return {
        request: prepared.request,
        environment: prepared.environment,
        requestId: createId("collection"),
      };
    }),
  );

  const steps = await evaluateStepsParallel(requests, environment, batch);

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    tallyTests(result, step);
    if (step.error && !step.testResults) {
      result.failed += 1;
      result.totalTests += 1;
    }
    result.steps.push(step);
    onStep?.(step, index, requests.length);
  }

  return result;
}
