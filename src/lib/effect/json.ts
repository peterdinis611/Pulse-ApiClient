import { Effect } from "effect";
import { ParseError } from "./errors";

export function parseJsonEffect<A>(raw: string, label = "JSON"): Effect.Effect<A, ParseError> {
  return Effect.try({
    try: () => JSON.parse(raw) as A,
    catch: (cause) => new ParseError({ label, cause }),
  });
}
