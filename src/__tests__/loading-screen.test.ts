import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "@/components/LoadingScreen";

describe("LoadingScreen", () => {
  it("boots the desk without a spinner", () => {
    const html = renderToStaticMarkup(createElement(LoadingScreen, { label: "Loading app" }));
    expect(html).toContain("pulse-boot");
    expect(html).toContain("Desk boot");
    expect(html).toContain("GET");
    expect(html).toContain("/workspace");
    expect(html).toContain("TTFB");
    expect(html).not.toContain("animate-spin");
  });
});
