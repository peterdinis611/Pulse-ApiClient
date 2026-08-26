import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { featureDocsFumadocsFiles, featureDocsMarkdown } from "../src/lib/feature-docs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(root, "docs/site/content/docs");

writeFileSync(join(root, "docs/FEATURES.md"), featureDocsMarkdown());

rmSync(contentRoot, { recursive: true, force: true });
mkdirSync(contentRoot, { recursive: true });

for (const file of featureDocsFumadocsFiles()) {
  const dest = join(contentRoot, file.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, file.contents);
}

const screenshots = join(root, "docs/screenshots");
const publicScreenshots = join(root, "docs/site/public/screenshots");
if (existsSync(screenshots)) {
  mkdirSync(join(root, "docs/site/public"), { recursive: true });
  rmSync(publicScreenshots, { recursive: true, force: true });
  cpSync(screenshots, publicScreenshots, { recursive: true });
}

console.log(`Wrote docs/FEATURES.md and ${featureDocsFumadocsFiles().length} Fumadocs files.`);
