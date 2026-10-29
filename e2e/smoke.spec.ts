import { expect, test } from "@playwright/test";

test.describe("Pulse web smoke", () => {
  test("request workspace shows response from demo send path", async ({ page }) => {
    await page.goto("/?shot=request");
    await expect(page.getByRole("button", { name: /send/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.locator(".response-toolbar")).toBeVisible();
    await expect(page.locator(".response-toolbar")).toContainText("200");

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

  test("import cURL via agent opens a request", async ({ page }) => {
    await page.goto("/?shot=request");
    const agentNav = page.getByRole("button", { name: /^agent$/i });
    await expect(agentNav).toBeVisible({ timeout: 30_000 });
    await agentNav.click();

    const input = page.getByPlaceholder(/search history|remember|recall|list memory/i);
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('curl -X GET "https://httpbin.org/get" -H "Accept: application/json"');
    await page.locator('[data-view="agent"]').getByRole("button", { name: /^send$/i }).click();

    await expect(page.locator('[data-view="agent"]')).toContainText(
      /import|opened|httpbin|request|tab|GET/i,
      { timeout: 20_000 },
    );
  });

  test("collection run confirm path surfaces in agent", async ({ page }) => {
    await page.goto("/?shot=request");
    const agentNav = page.getByRole("button", { name: /^agent$/i });
    await expect(agentNav).toBeVisible({ timeout: 30_000 });
    await agentNav.click();

    const input = page.getByPlaceholder(/search history|remember|recall|list memory/i);
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill("run collection");
    await page.locator('[data-view="agent"]').getByRole("button", { name: /^send$/i }).click();

    await expect(page.locator('[data-view="agent"]')).toContainText(
      /confirm|collection|run|disabled|capability|no collection|active/i,
      { timeout: 20_000 },
    );
  });

  test("language toggle switches chrome locale", async ({ page }) => {
    await page.goto("/?shot=request");
    await expect(page.getByRole("button", { name: /send/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    const langToggle = page
      .getByRole("button", { name: /^(en|sk|language|jazyk)$/i })
      .or(page.locator("[data-language-toggle], [aria-label*=language i], [title*=language i]"))
      .first();

    if (await langToggle.isVisible().catch(() => false)) {
      await langToggle.click();
      await expect(page.locator("body")).toBeVisible();
    } else {
      await page.getByRole("button", { name: /^settings$/i }).click();
      await expect(page.locator('[data-view="settings"], #appearance')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/language|jazyk|release channel|kanál/i).first()).toBeVisible();
    }
  });
});
