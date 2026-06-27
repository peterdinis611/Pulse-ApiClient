import { Data } from "effect";

export class TauriInvokeError extends Data.TaggedError("TauriInvokeError")<{
  command: string;
  cause: unknown;
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  label: string;
  cause: unknown;
}> {}

export class ImportCollectionError extends Data.TaggedError("ImportCollectionError")<{
  kind: "postman" | "pulse" | "openapi" | "json";
  message: string;
  cause?: unknown;
}> {}
