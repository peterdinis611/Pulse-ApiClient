import { describe, expect, it } from "vitest";
import { PRODUCT_TOUR_SELECTORS, PRODUCT_TOUR_STEP_COUNT } from "@/lib/product-tour";

describe("product tour", () => {
  it("covers first-run setup, Git, and the locked mock", () => {
    expect(PRODUCT_TOUR_STEP_COUNT).toBeGreaterThanOrEqual(PRODUCT_TOUR_SELECTORS.length);
    expect(PRODUCT_TOUR_SELECTORS).toEqual(
      expect.arrayContaining([
        "[data-tour='onboarding']",
        "[data-tour='git-workspace']",
        "[data-tour='mock-server']",
      ]),
    );
  });
});
