import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeferredFallback } from "@/components/DeferredFallback";

describe("DeferredFallback", () => {
  it("renders an empty placeholder on the server / first paint", () => {
    const html = renderToStaticMarkup(
      createElement(DeferredFallback, null, createElement("div", { className: "pulse-boot" }, "Loading")),
    );
    expect(html).not.toContain("pulse-boot");
    expect(html).toContain("aria-hidden");
  });
});
