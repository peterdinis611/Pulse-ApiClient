import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareRequest } from "@/lib/http-client";
import { runCollection, runCollectionAuto } from "@/lib/collection-runner";
import { createEnvironment, createKeyValue, createRequest, createSavedRequest } from "@/lib/helpers";
import type { HttpResponse } from "@/types";

const sendRequest = vi.hoisted(() => vi.fn());
const sendRequestsBatch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http-client")>();
  return {
    ...actual,
    sendRequest,
    sendRequestsBatch,
  };
});

function ok(url: string): HttpResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: [],
    body: url,
    elapsedMs: 12,
    sizeBytes: url.length,
  };
}

describe("collection-runner", () => {
  beforeEach(() => {
    sendRequest.mockReset();
    sendRequestsBatch.mockReset();
    sendRequest.mockImplementation(async (request, environment) => {
      const prepared = prepareRequest(request, environment);
      return ok(prepared.url);
    });
    sendRequestsBatch.mockImplementation(async (items) =>
      items.map(({ request, environment }: { request: ReturnType<typeof createRequest>; environment: unknown }) => ({
        response: ok(prepareRequest(request, environment as never).url),
      })),
    );
  });

  it("runs each data-file row as a full iteration", async () => {
    const collectionId = "col_run";
    const requests = [
      createSavedRequest(
        createRequest({
          name: "User",
          url: "https://api.example.com/users/{{id}}",
          tests: "",
        }),
        { collectionId, name: "User" },
      ),
      createSavedRequest(
        createRequest({
          name: "Echo",
          url: "https://api.example.com/echo/{{id}}",
          tests: "",
        }),
        { collectionId, name: "Echo" },
      ),
    ];

    const result = await runCollection(
      collectionId,
      "API",
      requests,
      createEnvironment("Local"),
      undefined,
      {
        dataRows: [{ id: "1" }, { id: "2" }],
        dataFileName: "users.csv",
        folderPath: "Users",
      },
    );

    expect(sendRequest).toHaveBeenCalledTimes(4);
    expect(sendRequestsBatch).not.toHaveBeenCalled();
    expect(result.iterations).toBe(2);
    expect(result.dataFileName).toBe("users.csv");
    expect(result.folderPath).toBe("Users");
    expect(result.steps.map((step) => step.iteration)).toEqual([1, 1, 2, 2]);
    expect(result.steps.map((step) => step.response?.body)).toEqual([
      "https://api.example.com/users/1",
      "https://api.example.com/echo/1",
      "https://api.example.com/users/2",
      "https://api.example.com/echo/2",
    ]);
  });

  it("lets data-file values override environment variables", async () => {
    const environment = createEnvironment("Local");
    environment.variables = [createKeyValue({ key: "id", value: "env", enabled: true })];
    const requests = [
      createSavedRequest(
        createRequest({
          url: "https://api.example.com/{{id}}",
          tests: "",
        }),
        { name: "One" },
      ),
    ];

    const result = await runCollection("col", "API", requests, environment, undefined, {
      dataRows: [{ id: "row" }],
    });

    expect(result.steps[0]?.response?.body).toBe("https://api.example.com/row");
    expect(result.steps[0]?.iteration).toBeUndefined();
  });

  it("records send failures as failed steps", async () => {
    sendRequest.mockRejectedValueOnce(new Error("connection reset"));
    const requests = [
      createSavedRequest(createRequest({ tests: "", name: "Broken" }), { name: "Broken" }),
    ];

    const result = await runCollection("col", "API", requests, null);
    expect(result.failed).toBe(1);
    expect(result.steps[0]?.error).toContain("connection reset");
  });

  it("uses the sequential runner when a data file is present", async () => {
    const requests = [
      createSavedRequest(createRequest({ tests: "", url: "https://example.com/a" }), { name: "A" }),
    ];
    await runCollectionAuto("col", "API", requests, null, undefined, {
      dataRows: [{ n: "1" }],
    });
    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(sendRequestsBatch).not.toHaveBeenCalled();
  });

  it("batches when there is no script and no data file", async () => {
    const requests = [
      createSavedRequest(createRequest({ tests: "", url: "https://example.com/a" }), { name: "A" }),
      createSavedRequest(createRequest({ tests: "", url: "https://example.com/b" }), { name: "B" }),
    ];
    const result = await runCollectionAuto("col", "API", requests, null);
    expect(sendRequestsBatch).toHaveBeenCalledTimes(1);
    expect(sendRequest).not.toHaveBeenCalled();
    expect(result.steps).toHaveLength(2);
    expect(result.iterations).toBe(1);
  });

  it("reports progress across iterations", async () => {
    const progress: Array<[number, number]> = [];
    const requests = [
      createSavedRequest(createRequest({ tests: "", url: "https://example.com/{{n}}" }), { name: "A" }),
    ];
    await runCollection(
      "col",
      "API",
      requests,
      null,
      (_step, index, total) => {
        progress.push([index, total]);
      },
      { dataRows: [{ n: "1" }, { n: "2" }, { n: "3" }] },
    );
    expect(progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });
});
