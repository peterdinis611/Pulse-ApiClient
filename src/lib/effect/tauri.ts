import { invoke } from "@tauri-apps/api/core";
import { Effect, Layer, ManagedRuntime } from "effect";
import { TauriInvokeError } from "./errors";

export function invokeEffect<A>(
  command: string,
  args?: Record<string, unknown>,
): Effect.Effect<A, TauriInvokeError> {
  return Effect.tryPromise({
    try: () => invoke<A>(command, args),
    catch: (cause) => new TauriInvokeError({ command, cause }),
  });
}

export function invokeEffectVoid(
  command: string,
  args?: Record<string, unknown>,
): Effect.Effect<void, TauriInvokeError> {
  return invokeEffect<void>(command, args);
}

export const appRuntime = ManagedRuntime.make(Layer.empty);

export function runEffectsParallel<A, E>(
  effects: ReadonlyArray<Effect.Effect<A, E>>,
  concurrency: number | "unbounded" = "unbounded",
): Effect.Effect<Array<A>, E> {
  if (effects.length === 0) {
    return Effect.succeed([]);
  }

  return Effect.all(effects, { concurrency });
}
