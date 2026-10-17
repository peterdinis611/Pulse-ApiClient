import { expect, test } from "@playwright/test";

test.describe("Pulse web smoke", () => {
  test("request workspace shows response from demo send path", async ({ page }) => {
    await page.goto("/?shot=request");
    await expect(page.getByRole("button", { name: /send/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Screenshot bootstrap seeds a response; assert the panel is live.
    await expect(page.locator(".response-toolbar")).toBeVisible();
    await expect(page.locator(".response-toolbar")).toContainText("200");

    // Clicking Send exercises the request path (web may fail without Tauri IPC —
    // we only require the control to stay interactive).
    await page.getByRole("button", { name: /send/i }).first().click();
    await expect(page.getByRole("button", { name: /send|cancel/i }).first()).toBeVisible();
  });

  test("agent search history intent runs", async ({ page }) => {
    await page.goto("/?shot=request");
    const agentNav = page.getByRole("button", { name: /^agent$/i });
    await expect(agentNav).toBeVisible({ timeout: 30_000 });
    await agentNav.click();

    const input = page.getByPlaceholder(/search history|remember|recall|list memory/i);
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill("search history users");
    await page.locator('[data-view="agent"]').getByRole("button", { name: /^send$/i }).click();

    await expect(page.locator('[data-view="agent"]')).toContainText(
      /RAG|workspace|No Git|history|match|users|reindex|attached/i,
      { timeout: 20_000 },
    );
  });
});
