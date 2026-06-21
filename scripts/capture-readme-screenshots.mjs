import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs/screenshots");
const port = 4173;
const baseUrl = `http://127.0.0.1:${port}`;

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

function startPreview() {
  return spawn(
    "bun",
    ["run", "preview", "--", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: root,
      stdio: "pipe",
      env: process.env,
    },
  );
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function capture(page, filename, url, readySelector) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(readySelector, { timeout: 30000 });
  await page.waitForTimeout(750);
  await page.screenshot({
    path: path.join(outDir, filename),
    fullPage: false,
  });
  console.log(`Saved ${filename}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  console.log("Building auth preview…");
  await run("bun", ["run", "build"]);

  let preview = startPreview();
  try {
    await waitForServer(baseUrl);
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    await capture(page, "auth.png", `${baseUrl}/`, "text=Welcome back");
    await browser.close();
  } finally {
    preview.kill("SIGTERM");
    await new Promise((resolve) => preview.on("close", resolve));
  }

  console.log("Building demo workspace preview…");
  await run("bun", ["run", "build"], { VITE_SCREENSHOT_MODE: "true" });

  preview = startPreview();
  try {
    await waitForServer(baseUrl);
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    const shots = [
      ["overview.png", "overview", "text=Welcome back"],
      ["request.png", "request", "text=GitHub User"],
      ["settings.png", "settings", "text=Appearance"],
    ];

    for (const [filename, shot, readySelector] of shots) {
      await capture(page, filename, `${baseUrl}/?shot=${shot}`, readySelector);
    }

    await browser.close();
  } finally {
    preview.kill("SIGTERM");
    await new Promise((resolve) => preview.on("close", resolve));
  }

  console.log("Restoring default build…");
  await run("bun", ["run", "build"]);
  console.log(`Screenshots saved to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
