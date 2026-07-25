import { Cause, Effect } from "effect";
import { describe, expect, it } from "vitest";
import { TauriInvokeError } from "@/lib/effect/errors";
import { parseJsonEffect } from "@/lib/effect/json";
import { runEffectSync } from "@/lib/effect/run";
import { runEffectsParallel } from "@/lib/effect/tauri";

describe("effect helpers", () => {
  it("parses valid json", () => {
    const value = runEffectSync(parseJsonEffect<{ ok: boolean }>('{"ok":true}', "test"));
    expect(value.ok).toBe(true);
  });

  it("returns ParseError for invalid json", () => {
    const result = Effect.runSyncExit(parseJsonEffect("not-json", "test"));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const error = Cause.squash(result.cause);
      expect(error).toMatchObject({ _tag: "ParseError" });
    }
  });

  it("tags tauri invoke failures", async () => {
    const effect = Effect.tryPromise({
      try: () => Promise.reject(new Error("ipc failed")),
      catch: (cause) => new TauriInvokeError({ command: "test_cmd", cause }),
    });

    const exit = await Effect.runPromiseExit(effect);
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.squash(exit.cause);
      expect(error).toMatchObject({ _tag: "TauriInvokeError", command: "test_cmd" });
    }
  });

  it("runs independent effects in parallel", () => {
    const order: number[] = [];
    const effects = [1, 2, 3].map((value) =>
      Effect.sync(() => {
        order.push(value);
        return value * 2;
      }),
    );

    const result = runEffectSync(runEffectsParallel(effects, "unbounded"));
    expect(result).toEqual([2, 4, 6]);
    expect(order).toEqual([1, 2, 3]);
  });
});
