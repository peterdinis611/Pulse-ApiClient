import { describe, expect, it } from "vitest";
import { applyPathParams, extractPathParamNames, syncPathParams, urlPathPortion } from "@/lib/path-params";
import { createKeyValue } from "@/lib/helpers";

describe("path-params", () => {
  it("ignores protocol and port when extracting names", () => {
    expect(urlPathPortion("https://api.example.com:3000/users/:id/orders/:orderId")).toBe(
      "/users/:id/orders/:orderId",
    );
    expect(extractPathParamNames("https://api.example.com:3000/users/:id/orders/{orderId}")).toEqual([
      "id",
      "orderId",
    ]);
  });

  it("keeps existing values when the URL still has the token", () => {
    const existing = [createKeyValue({ key: "id", value: "42" })];
    const next = syncPathParams("https://api.example.com/users/:id", existing);
    expect(next).toHaveLength(1);
    expect(next[0]?.value).toBe("42");
  });

  it("drops params that left the URL", () => {
    const existing = [createKeyValue({ key: "id", value: "42" })];
    expect(syncPathParams("https://api.example.com/users", existing)).toEqual([]);
  });

  it("substitutes enabled path values", () => {
    const url = applyPathParams("https://api.example.com/users/:id/orders/{orderId}", [
      createKeyValue({ key: "id", value: "ada" }),
      createKeyValue({ key: "orderId", value: "9" }),
    ]);
    expect(url).toBe("https://api.example.com/users/ada/orders/9");
  });
});
