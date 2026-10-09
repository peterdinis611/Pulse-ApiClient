import { writeFileSync } from "node:fs";
import { languagePackTemplateJson } from "../src/lib/i18n.ts";

writeFileSync("examples/pulse-language.en.json", `${languagePackTemplateJson().trimEnd()}\n`);
console.log("synced examples/pulse-language.en.json");
