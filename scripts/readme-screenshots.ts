import { spawn } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 1420;
const BASE = `http://localhost:${PORT}`;
const OUT = resolve(ROOT, "docs/screenshots");
const PUBLIC_OUT = resolve(ROOT, "docs/site/public/screenshots");

const SHOTS: Array<{ shot: string; file: string; wait: string }> = [
  { shot: "auth", file: "auth.png", wait: "text=Your API workspace, locally." },
  { shot: "overview", file: "overview.png", wait: "text=Welcome back, Demo" },
  { shot: "request", file: "request.png", wait: "text=octocat" },
  { shot: "settings", file: "settings.png", wait: "text=Appearance" },
];

async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await serverUp()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Vite did not become ready on ${BASE}`);
}

async function tidyChrome(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("[data-sonner-toaster], [data-sonner-toast], .whats-new-overlay").forEach((node) => {
      node.remove();
    });
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  let vite: ReturnType<typeof spawn> | null = null;
  const alreadyRunning = await serverUp();
  if (!alreadyRunning) {
    vite = spawn("bun", ["run", "dev"], {
      cwd: ROOT,
      env: { ...process.env, VITE_SCREENSHOT_MODE: "true" },
      stdio: "inherit",
    });
  } else {
    console.log(`reusing ${BASE}`);
  }

  try {
    await waitForServer();
    const browser = await chromium.launch();
    try {
      for (const item of SHOTS) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 2,
          colorScheme: "light",
          locale: "en-US",
        });
        await context.addInitScript(() => {
          localStorage.setItem("pulse-api-client/locale", "en");
          localStorage.setItem("pulse-api-client/theme", "light");
        });
        const page = await context.newPage();
        await page.goto(`${BASE}/?shot=${item.shot}`, { waitUntil: "networkidle" });
        await page.waitForSelector(item.wait, { timeout: 15_000 });
        await tidyChrome(page);
        const dest = resolve(OUT, item.file);
        await page.screenshot({ path: dest, type: "png" });
        console.log(`wrote ${item.file}`);
        await context.close();
      }
    } finally {
      await browser.close();
    }

    mkdirSync(PUBLIC_OUT, { recursive: true });
    cpSync(OUT, PUBLIC_OUT, { recursive: true });
    console.log(`copied screenshots to ${PUBLIC_OUT}`);
  } finally {
    if (vite?.pid) {
      vite.kill("SIGTERM");
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
