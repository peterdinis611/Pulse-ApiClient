import { Effect } from "effect";
import { appRuntime, runEffectsParallel } from "./tauri";

export function runEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return appRuntime.runPromise(effect);
}

export function runEffectSync<A, E>(effect: Effect.Effect<A, E, never>): A {
  return Effect.runSync(effect);
}

export function runParallel<A, E>(
  effects: ReadonlyArray<Effect.Effect<A, E>>,
  concurrency: number | "unbounded" = "unbounded",
): Promise<Array<A>> {
  return runEffect(runEffectsParallel(effects, concurrency));
}

export function runParallelAll<T extends ReadonlyArray<Effect.Effect<unknown, unknown>>>(
  effects: T,
  concurrency: number | "unbounded" = "unbounded",
): Promise<{ [K in keyof T]: T[K] extends Effect.Effect<infer A, infer _E> ? A : never }> {
  return runEffect(
    runEffectsParallel(effects, concurrency),
  ) as Promise<{ [K in keyof T]: T[K] extends Effect.Effect<infer A, infer _E> ? A : never }>;
}
