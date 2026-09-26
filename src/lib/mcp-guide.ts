import type { LocaleCopy } from "@/lib/changelog";

export type McpGuideSection = {
  id: string;
  title: LocaleCopy;
  body: LocaleCopy;
  bullets?: LocaleCopy[];
  code?: string;
};

export const MCP_GUIDE_INTRO: LocaleCopy = {
  en: "Pulse exposes the same Rust HTTP engine to Cursor (and other MCP clients) over stdio. The agent can send requests, run collections, import OpenAPI, and work on your Git YAML workspace — without living inside the desktop window.",
  sk: "Pulse sprístupní ten istý Rust HTTP engine Cursoru (a iným MCP klientom) cez stdio. Agent môže posielať requesty, spúšťať kolekcie, importovať OpenAPI a pracovať s Git YAML workspace — mimo okna desktopovej appky.",
};

export const MCP_GUIDE_SECTIONS: McpGuideSection[] = [
  {
    id: "setup",
    title: { en: "One-time setup", sk: "Jednorazové nastavenie" },
    body: {
      en: "Build the Python binding once, then point Cursor at the repo’s MCP entry. The project already ships `.cursor/mcp.json`.",
      sk: "Raz zostav Python binding a nasmeruj Cursor na MCP vstup z repa. Projekt už obsahuje `.cursor/mcp.json`.",
    },
    bullets: [
      {
        en: "From the repo root: `bun run pulse:cli:install` (creates `.venv` + `pulse_native`).",
        sk: "Z koreňa repa: `bun run pulse:cli:install` (vytvorí `.venv` + `pulse_native`).",
      },
      {
        en: "Reload Cursor → Settings → MCP → enable the **pulse** server if it is disabled.",
        sk: "Reload Cursor → Settings → MCP → zapni server **pulse**, ak je vypnutý.",
      },
      {
        en: "Set `PULSE_WORKSPACE` to the same folder you attached in Settings → Data (or keep the examples path in `.cursor/mcp.json`).",
        sk: "Nastav `PULSE_WORKSPACE` na ten istý priečinok ako v Nastavenia → Dáta (alebo nechaj examples cestu v `.cursor/mcp.json`).",
      },
    ],
    code: `{
  "mcpServers": {
    "pulse": {
      "command": "\${workspaceFolder}/.venv/bin/python",
      "args": ["\${workspaceFolder}/python/pulse_mcp.py"],
      "env": {
        "PULSE_WORKSPACE": "\${workspaceFolder}/python/examples/git-workspace"
      }
    }
  }
}`,
  },
  {
    id: "talk",
    title: { en: "What to ask the agent", sk: "Čo povedať agentovi" },
    body: {
      en: "You do not need tool names — Cursor can pick prompts, or you can speak plainly. Mutating HTTP methods need an explicit confirm.",
      sk: "Nemusíš poznať názvy tools — Cursor vyberie prompt, alebo píš prirodzene. Mutujúce HTTP metódy potrebujú explicitné potvrdenie.",
    },
    bullets: [
      {
        en: "“List my Git workspace status and pending mutations.”",
        sk: "„Zhrň stav Git workspace a pending mutácie.“",
      },
      {
        en: "“Send the saved request `req_list_pets` with the staging environment.”",
        sk: "„Pošli uložený request `req_list_pets` so staging prostredím.“",
      },
      {
        en: "“Import this OpenAPI file into the YAML workspace as collection Pets.”",
        sk: "„Importuj tento OpenAPI súbor do YAML workspace ako kolekciu Pets.“",
      },
      {
        en: "“Run the pets collection, then explain failures from the last run.”",
        sk: "„Spusti kolekciu pets a vysvetli zlyhania z last run.“",
      },
      {
        en: "Built-in prompts: `run_and_explain`, `send_saved_request`, `workspace_status`, `import_openapi_workspace`, `contract_check`, `graphql_introspect`, `curl_import`, …",
        sk: "Vstavané prompty: `run_and_explain`, `send_saved_request`, `workspace_status`, `import_openapi_workspace`, `contract_check`, `graphql_introspect`, `curl_import`, …",
      },
    ],
  },
  {
    id: "tools",
    title: { en: "Tool map", sk: "Mapa tools" },
    body: {
      en: "Same engine as the CLI. Prefer workspace tools when `PULSE_WORKSPACE` is set.",
      sk: "Rovnaký engine ako CLI. Keď je nastavené `PULSE_WORKSPACE`, preferuj workspace tools.",
    },
    bullets: [
      {
        en: "HTTP — `pulse_send`, `pulse_graphql`, `pulse_run_collection`, `pulse_bench`, `pulse_pre_request`, `pulse_run_tests`, `pulse_interpolate`",
        sk: "HTTP — `pulse_send`, `pulse_graphql`, `pulse_run_collection`, `pulse_bench`, `pulse_pre_request`, `pulse_run_tests`, `pulse_interpolate`",
      },
      {
        en: "Workspace — `pulse_workspace_list|read|write|send|search|envs|history|pending|delete|status|import_openapi|export_openapi`",
        sk: "Workspace — `pulse_workspace_list|read|write|send|search|envs|history|pending|delete|status|import_openapi|export_openapi`",
      },
      {
        en: "Convert — `pulse_openapi`, `pulse_har`, `pulse_curl`, `pulse_snippet`, `pulse_export_openapi`, `pulse_diff`, `pulse_schema`",
        sk: "Konverzie — `pulse_openapi`, `pulse_har`, `pulse_curl`, `pulse_snippet`, `pulse_export_openapi`, `pulse_diff`, `pulse_schema`",
      },
      {
        en: "CI / mock — `pulse_contract`, `pulse_junit`, `pulse_last_run`, `pulse_validate_run`, `pulse_mock_start`, `pulse_mock_stop`, `pulse_help`",
        sk: "CI / mock — `pulse_contract`, `pulse_junit`, `pulse_last_run`, `pulse_validate_run`, `pulse_mock_start`, `pulse_mock_stop`, `pulse_help`",
      },
    ],
  },
  {
    id: "resources",
    title: { en: "Resources the agent can read", sk: "Resources, ktoré agent vie čítať" },
    body: {
      en: "URI templates avoid dumping huge JSON into the chat. Conversion tools write under `python/examples/.out/`.",
      sk: "URI šablóny zabránia obrovskému JSON v chate. Konverzie píšu do `python/examples/.out/`.",
    },
    bullets: [
      {
        en: "`pulse://examples/pets.json` — bundled fixtures",
        sk: "`pulse://examples/pets.json` — balíkové fixtures",
      },
      {
        en: "`pulse://last-run` — last collection run summary / full result",
        sk: "`pulse://last-run` — posledný beh kolekcie (summary / full)",
      },
      {
        en: "`pulse://workspace/requests|environments|history|pending` and `pulse://workspace/request/{id}`",
        sk: "`pulse://workspace/requests|environments|history|pending` a `pulse://workspace/request/{id}`",
      },
      {
        en: "`pulse://openapi/{file}` · `pulse://out/{file}` — specs and generated files",
        sk: "`pulse://openapi/{file}` · `pulse://out/{file}` — špecifikácie a vygenerované súbory",
      },
    ],
  },
  {
    id: "safety",
    title: { en: "Safety & desktop sync", sk: "Bezpečnosť a sync s desktopom" },
    body: {
      en: "POST / PUT / PATCH / DELETE from the agent require `confirm=true`. Without it, Pulse writes `.pulse/pending` for you to approve in the app.",
      sk: "POST / PUT / PATCH / DELETE z agenta vyžadujú `confirm=true`. Bez toho Pulse zapíše `.pulse/pending` na schválenie v appke.",
    },
    bullets: [
      {
        en: "Agent history lands in `.pulse/history.jsonl` with `source=agent` (Explorer History can export HAR).",
        sk: "História agenta ide do `.pulse/history.jsonl` so `source=agent` (Explorer História vie exportovať HAR).",
      },
      {
        en: "Secrets stay in gitignored `.env` / keychain as `{{secret.*}}` — never ask the agent to paste tokens into YAML.",
        sk: "Secret hodnoty ostávajú v gitignore `.env` / keychain ako `{{secret.*}}` — nenechaj agenta písať tokeny do YAML.",
      },
      {
        en: "Deleting a YAML request also needs `confirm=true` (`pulse_workspace_delete`).",
        sk: "Zmazanie YAML requestu tiež potrebuje `confirm=true` (`pulse_workspace_delete`).",
      },
    ],
  },
  {
    id: "cli",
    title: { en: "Same engine from the terminal", sk: "Ten istý engine z terminálu" },
    body: {
      en: "Everything MCP can do has a CLI twin under `bun run pulse:cli …` — useful in CI or when Cursor is offline.",
      sk: "Všetko, čo MCP vie, má CLI dvojča pod `bun run pulse:cli …` — hodí sa do CI alebo keď Cursor nie je k dispozícii.",
    },
    bullets: [
      {
        en: "`bun run pulse:cli help` — command map",
        sk: "`bun run pulse:cli help` — mapa príkazov",
      },
      {
        en: "`bun run pulse:cli workspace --workspace … status|list|send`",
        sk: "`bun run pulse:cli workspace --workspace … status|list|send`",
      },
      {
        en: "`bun run pulse:cli doctor` — native module + workspace sanity",
        sk: "`bun run pulse:cli doctor` — native modul + kontrola workspace",
      },
    ],
  },
];
