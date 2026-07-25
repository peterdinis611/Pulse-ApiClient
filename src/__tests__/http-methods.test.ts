import { describe, expect, it } from "vitest";
import { methodBadgeClass, methodShortLabel, methodTextClass } from "@/lib/method-colors";
import { HTTP_METHODS } from "@/types";

describe("http methods", () => {
  it("includes QUERY in the shared method list", () => {
    expect(HTTP_METHODS).toContain("QUERY");
  });

  it("styles QUERY like other named methods", () => {
    expect(methodShortLabel("QUERY")).toBe("QRY");
    expect(methodTextClass("QUERY")).toBe("text-method-query");
    expect(methodBadgeClass("QUERY")).toBe("method-badge-query");
  });
});
