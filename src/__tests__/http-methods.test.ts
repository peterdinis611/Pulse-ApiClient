import { describe, expect, it } from "vitest";
import { methodBadgeClass, methodShortLabel, methodTextClass, methodToneStyle } from "@/lib/method-colors";
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

  it("gives HEAD and OPTIONS their own method colors", () => {
    expect(methodTextClass("HEAD")).toBe("text-method-head");
    expect(methodBadgeClass("HEAD")).toBe("method-badge-head");
    expect(methodTextClass("OPTIONS")).toBe("text-method-options");
    expect(methodBadgeClass("OPTIONS")).toBe("method-badge-options");
  });

  it("exposes CSS tone variables for the method select pip", () => {
    expect(methodToneStyle("HEAD")["--method-current"]).toBe("var(--method-head)");
    expect(methodToneStyle("QUERY")["--method-current-bg"]).toBe("var(--method-query-bg)");
  });
});
