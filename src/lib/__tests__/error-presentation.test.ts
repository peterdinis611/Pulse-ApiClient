import { describe, expect, it } from "bun:test";
import { getErrorPresentation } from "@/lib/error-presentation";

describe("error-presentation", () => {
  it("maps actor provider errors to a friendly message", () => {
    const copy = getErrorPresentation(
      new Error('You used a hook from "ActorProvider" but it is not inside a <ActorProvider> component.'),
    );
    expect(copy.title).toContain("Workspace engine");
  });

  it("maps unknown errors to a generic message", () => {
    const copy = getErrorPresentation(new Error("Unexpected failure"));
    expect(copy.title).toBe("Something went wrong");
  });
});
