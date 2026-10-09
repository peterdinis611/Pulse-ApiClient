import { APP_NAME, readStorageItem, removeStorageItem, writeStorageItem } from "./app-config";

export const BUILTIN_LOCALES = ["en", "sk"] as const;
export type BuiltInLocale = (typeof BUILTIN_LOCALES)[number];

export const LOCALE_PREFERENCES = ["system", "en", "sk"] as const;
export type LocalePreference = (typeof LOCALE_PREFERENCES)[number];

export const EN_MESSAGES = {
  "rail.overview": "Overview",
  "rail.requests": "Requests",
  "rail.environments": "Environments",
  "rail.docs": "Docs",
  "rail.agent": "Agent",
  "rail.mcp": "MCP",
  "rail.settings": "Settings",

  "view.overview.title": "Overview",
  "view.overview.description": "Recent requests and saved endpoints across your workspace.",
  "view.environments.title": "Environments",
  "view.environments.description": "Variables for URLs, headers, auth, and bodies.",
  "view.docs.title": "Docs",
  "view.docs.description": "Guides for every Pulse feature — requests, auth, tests, themes, and more.",
  "view.agent.title": "Agent",
  "view.agent.description": "Local assistant for cURL import, response explain, workspace status, and collection runs.",
  "view.mcp.title": "MCP",
  "view.mcp.description": "Connect Cursor to the Pulse engine — setup, tools, prompts, and safety.",
  "view.settings.title": "Settings",
  "view.settings.description": "Appearance, data, collections, and HTTP engine.",
  "view.explorer": "Explorer",
  "view.hideExplorer": "Hide explorer",
  "view.newTab": "New request tab",
  "view.closeTab": "Close tab",

  "window.overview": "Overview",
  "window.settings": "Settings",
  "window.environments": "Environments",
  "window.docs": "Docs",
  "window.agent": "Agent",
  "window.mcp": "MCP",

  "agent.eyebrow": "Local assistant",
  "agent.placeholder": "Try: search history users, remember env=staging, recall env, list memory",
  "agent.send": "Send",
  "agent.clear": "Clear chat",
  "agent.confirm": "Confirm",
  "agent.cancel": "Cancel",
  "agent.quick.curl": "Import cURL",
  "agent.quick.explain": "Explain last response",
  "agent.quick.workspace": "Workspace status",
  "agent.quick.run": "Run active collection",
  "agent.quick.tests": "Explain test failures",
  "agent.quick.history": "Agent history",
  "agent.quick.memory": "List memory",
  "agent.quick.rag": "Reindex RAG",
  "agent.empty": "Ask in plain language or use a quick action. Mutating runs need an explicit confirm.",
  "agent.working": "Working…",
  "agent.openRequest": "Open request",
  "agent.openMcp": "Cursor MCP bridge",
  "agent.settings.nav": "Agent / LLM",
  "agent.settings.title": "Agent & LLM",
  "agent.settings.description": "Turn the local assistant on or off and pick which intents it may run. Cloud LLM tool-calling comes later.",
  "agent.settings.enabled": "Enable in-app agent",
  "agent.settings.enabledHint": "Shows Agent in the rail and command palette. Off hides the desk completely.",
  "agent.settings.capabilities": "Expand capabilities",
  "agent.settings.capabilitiesHint": "{enabled} of {total} intents enabled — open to toggle each one",
  "agent.settings.provider": "LLM provider",
  "agent.settings.providerNone": "None (local intents only)",
  "agent.settings.providerSoon": "Coming soon",
  "agent.settings.apiKey": "API key",
  "agent.settings.apiKeyHint": "Stored on this device for a future LLM backend. Not used yet.",
  "agent.settings.saved": "Agent settings saved",
  "agent.settings.save": "Save agent settings",
  "agent.disabled.title": "Agent is off",
  "agent.disabled.description": "Enable the in-app assistant in Settings → Agent / LLM, or during first-run setup.",
  "agent.capability.import_curl": "Import cURL",
  "agent.capability.import_curlHint": "Paste curl → open a request tab",
  "agent.capability.explain_response": "Explain response",
  "agent.capability.explain_responseHint": "Summarize the last response body",
  "agent.capability.explain_tests": "Explain test failures",
  "agent.capability.explain_testsHint": "Walk the last test run",
  "agent.capability.workspace_status": "Workspace status",
  "agent.capability.workspace_statusHint": "Git root and pending mutations",
  "agent.capability.workspace_history": "Agent history",
  "agent.capability.workspace_historyHint": "Recent entries from .pulse/history.jsonl",
  "agent.capability.run_collection": "Run collection",
  "agent.capability.run_collectionHint": "Run the active collection (needs confirm)",
  "agent.capability.graphql_summarize": "GraphQL summarize",
  "agent.capability.graphql_summarizeHint": "Summarize introspection payloads",
  "agent.capability.sse_parse": "Parse SSE",
  "agent.capability.sse_parseHint": "Parse pasted Server-Sent Events documents",
  "agent.capability.memory": "Structured memory",
  "agent.capability.memoryHint": "Remember / recall / forget facts in the workspace",
  "agent.capability.memory_rag": "RAG over history",
  "agent.capability.memory_ragHint": "Search request history + facts via hashed n-gram TF-IDF",
  "agent.memory.title": "Memory",
  "agent.memory.description": "Workspace facts sync via memory/facts.yaml. Local facts stay on this device.",
  "agent.memory.count": "{count} facts indexed",
  "agent.memory.none": "No workspace attached or memory is empty.",
  "agent.memory.refresh": "Reindex",
  "agent.memory.clearLocal": "Clear local facts",
  "agent.memory.cleared": "Cleared {count} local facts",
  "agent.rag.title": "RAG index",
  "agent.rag.description": "Lightweight embeddings over request history and facts — no PyTorch. Supports method:/status:/env: filters.",
  "agent.rag.count": "{count} documents indexed",
  "agent.rag.none": "No workspace attached or RAG index is empty.",
  "agent.rag.refresh": "Rebuild index",
  "agent.rag.prune": "Prune old 4xx",
  "agent.rag.pruned": "Pruned to {count} documents",
  "agent.settings.languageHint": "UI language follows the app locale — use Languages on the rail or Settings → Appearance.",
  "agent.md.helpIntro": "I understand these intents (local, no LLM yet):",
  "agent.md.helpOff": "The in-app agent is **turned off**. Enable it in **Settings → Agent / LLM**.",
  "agent.md.helpNone": "The agent is on, but every capability is disabled. Expand capabilities in **Settings → Agent / LLM**.",
  "agent.md.helpFooter": "Or use the quick-action chips below.",
  "agent.md.cap.import_curl": "• **Import cURL** — paste a curl command → opens a request tab",
  "agent.md.cap.explain_response": "• **Explain last response** — summarize status, body, GraphQL errors",
  "agent.md.cap.explain_tests": "• **Explain test failures** — walk the last test run",
  "agent.md.cap.workspace_status": "• **Workspace status** — Git workspace root + pending mutations",
  "agent.md.cap.workspace_history": "• **Agent history** — recent agent/MCP history from `.pulse/history.jsonl`",
  "agent.md.cap.run_collection": "• **Run active collection** — needs confirm (mutating requests)",
  "agent.md.cap.graphql_summarize": "• **GraphQL summarize** — summarize introspection body on the active tab",
  "agent.md.cap.sse_parse": "• **Parse SSE** — paste an SSE document",
  "agent.md.cap.memory": "• **Memory** — `remember key=value`, `recall key`, `forget key`, `list memory`",
  "agent.md.cap.memory_rag": "• **RAG** — `search history …` / `rag method:POST status:4xx …` (TF-IDF + filters; `reindex rag`)",
  "agent.md.usageRemember": "Usage: remember key=value  (optional --local)",
  "agent.md.pasteCurl": "Paste a cURL command (or wrap it in a ```bash fence).",
  "agent.md.pasteSse": "Paste an SSE document to parse (event/data blocks).",
  "agent.md.capabilityOff": "**{capability}** is turned off. Expand agent capabilities in **Settings → Agent / LLM**.",
  "agent.md.parsedCurl": "Parsed **{method}** `{url}`.\n\nOpen it as a new request tab?",
  "agent.md.curlFailed": "Could not parse cURL: {error}",
  "agent.md.noResponse": "No response on the active tab yet. Send a request first.",
  "agent.md.noTests": "No test results on the active tab. Run tests after a response.",
  "agent.md.noWorkspace": "No Git workspace attached. Set one in **Settings → Data & storage** (collections folder).",
  "agent.md.noWorkspaceHistory": "No Git workspace attached — cannot read `.pulse/history.jsonl`.",
  "agent.md.noWorkspaceMemory": "No Git workspace attached — cannot recall memory.",
  "agent.md.noWorkspaceForget": "No Git workspace attached — cannot forget memory.",
  "agent.md.noWorkspaceMemoryList": "No Git workspace attached — memory list is empty.",
  "agent.md.noWorkspaceRemember": "No Git workspace attached. Set one in **Settings → Data & storage** before remembering facts.",
  "agent.md.noWorkspaceRag": "No Git workspace attached — cannot search RAG index.",
  "agent.md.noWorkspaceRagReindex": "No Git workspace attached — cannot rebuild RAG index.",
  "agent.md.workspaceLabel": "**Workspace:** `{root}`",
  "agent.md.pendingLabel": "**Pending mutations:** {count}",
  "agent.md.historyCountLabel": "**Agent history entries:** {count}",
  "agent.md.workspaceFailed": "Workspace status failed: {error}",
  "agent.md.historyEmpty": "Agent history is empty.",
  "agent.md.historyRecent": "**Recent agent history** (newest first):",
  "agent.md.historyFailed": "History read failed: {error}",
  "agent.md.noCollection": "No active collection with saved requests. Select a collection in the explorer first.",
  "agent.md.runReady": "Ready to run **{name}** ({count} requests). Mutating methods may hit your API — confirm to proceed.",
  "agent.md.noGraphqlBody": "No response body to summarize. Send an introspection query (or any GraphQL response) first.",
  "agent.md.notGraphql": "Body is not a GraphQL introspection payload. Tip: use Docs / GraphQL explorer introspect, then ask again.",
  "agent.md.noSse": "No SSE events found in the pasted document.",
  "agent.md.sseParsed": "**Parsed {count} SSE event(s):**",
  "agent.md.remembered": "Remembered `{key}` = {value} (`{scope}`).",
  "agent.md.rememberFailed": "Remember failed: {error}",
  "agent.md.usageRecall": "Usage: recall <key or search>",
  "agent.md.recallTitle": "Recall “{query}”",
  "agent.md.recallFailed": "Recall failed: {error}",
  "agent.md.forgot": "Forgot `{key}`.",
  "agent.md.forgetMissing": "No memory found for `{key}`.",
  "agent.md.forgetFailed": "Forget failed: {error}",
  "agent.md.memoryTitle": "Agent memory",
  "agent.md.memoryEmpty": "_(empty)_",
  "agent.md.memoryListFailed": "Memory list failed: {error}",
  "agent.md.usageRag": "Usage: search history <query>  ·  rag <query>\n\nFilters: `method:POST status:500 env:staging`",
  "agent.md.ragFailed": "RAG search failed: {error}",
  "agent.md.ragRebuilt": "Rebuilt RAG index with **{count}** documents (history + facts).\n\n_Embedding runtime: hashed n-gram TF-IDF_",
  "agent.md.ragReindexFailed": "RAG reindex failed: {error}",
  "agent.md.ragHits": "**RAG** for “{query}” ({count} hit{plural})",
  "agent.md.ragNoHits": "**RAG** for “{query}”\n\n_(no matches — try reindex or a broader query)_",
  "agent.md.ragRuntime": "_Embedding runtime: hashed n-gram TF-IDF · filters: `method:POST status:4xx env:staging`_",
  "agent.md.ragContext": "**Related context** ({count} hit{plural})",
  "agent.md.collectionGone": "Collection is no longer available.",
  "agent.md.collectionRun": "**Collection run:** {name}",
  "agent.md.collectionStats": "Steps: {steps} · Passed: {passed} · Failed: {failed} · Tests: {tests}",
  "agent.md.statusLabel": "**Status:** {status}",
  "agent.md.timeSize": "**Time:** {time} ms · **Size:** {size} B",
  "agent.md.cacheHit": "**Cache:** hit",
  "agent.md.bodyPreview": "**Body preview:**",
  "agent.md.emptyBody": "(empty)",
  "agent.md.testsSummary": "**Tests:** {passed} passed · {failed} failed · {total} total",
  "agent.md.testsAllPassed": "All assertions passed.",
  "agent.md.testsFailures": "**Failures:**",
  "onboarding.agent.title": "In-app agent",
  "onboarding.agent.hint": "Optional local assistant. Turn it off anytime, or expand which intents it may use.",

  "mcp.eyebrow": "Agent bridge",
  "mcp.openDocs": "MCP in Docs",
  "mcp.openCliDocs": "Python CLI docs",
  "mcp.onThisPage": "On this page",
  "mcp.copy": "Copy",
  "mcp.copied": "Copied",
  "mcp.copyFailed": "Could not copy",

  "auth.headline": "Your API workspace, locally.",
  "auth.subhead": "Collections, environments, history, and tests — all in one fast desktop client.",
  "auth.feature.http": "Send HTTP, GraphQL, and WebSocket requests",
  "auth.feature.local": "Local-first workspaces stored on your device",
  "auth.stays": "Data stays on this device",
  "auth.privacy": "Local accounts only. No Pulse cloud — read the privacy policy in Docs after sign-in.",
  "auth.welcome": "Welcome back",
  "auth.create": "Create account",
  "auth.signInLead": "Sign in to open your workspace.",
  "auth.registerLead": "Register to get started.",
  "auth.login": "Login",
  "auth.register": "Register",
  "auth.fullName": "Full name",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.confirmPassword": "Confirm password",
  "auth.passwordPlaceholder": "Your password",
  "auth.passwordNewPlaceholder": "At least 6 characters",
  "auth.confirmPlaceholder": "Repeat password",
  "auth.signIn": "Sign in",
  "auth.createAccount": "Create account",
  "auth.noAccount": "Don't have an account?",
  "auth.hasAccount": "Already have an account?",
  "auth.signInFailed": "Sign in failed",
  "auth.registerFailed": "Registration failed",

  "settings.nav.appearance": "Appearance",
  "settings.nav.data": "Data & storage",
  "settings.nav.http": "HTTP engine",
  "settings.nav.layout": "Layout",
  "settings.nav.cookies": "Cookie jar",
  "settings.nav.collections": "Collections",
  "settings.nav.folders": "Folders",
  "settings.nav.aria": "Settings sections",
  "settings.sections": "Sections",
  "settings.appearance.title": "Appearance",
  "settings.appearance.description": `Choose how ${APP_NAME} looks and reads on this device.`,

  "settings.language.title": "Language",
  "settings.language.hint":
    "Built-in UI language. A custom JSON pack overlays any string; missing keys fall back here.",
  "settings.language.system": "Match system",
  "settings.language.en": "English",
  "settings.language.sk": "Slovenčina",
  "settings.language.systemHint": "Uses the OS language when Pulse has a match; otherwise English.",
  "settings.language.customTitle": "Custom language pack",
  "settings.language.customHint":
    "Upload a JSON object of key → string overrides. Missing keys fall back to the language above.",
  "settings.language.browse": "Browse",
  "settings.language.export": "Export template",
  "settings.language.clear": "Clear",
  "settings.language.reload": "Reload",
  "settings.language.load": "Load file",
  "settings.language.apply": "Apply JSON",
  "settings.language.loaded": "Loaded {count} keys from {name}",
  "settings.language.empty": "No custom pack loaded — Pulse uses the built-in language.",
  "settings.language.keys": "{count} keys",
  "settings.language.path": "Load from file",
  "settings.language.browserHint":
    "In the browser preview, the pack is stored locally in this browser. Use the desktop app to keep a file path and reload edits from disk.",
  "settings.language.removed": "Custom language pack removed",
  "settings.language.applied": "Custom language pack loaded",
  "settings.language.exported": "Template exported",
  "settings.language.loadFailed": "Could not load language pack",
  "settings.language.clearFailed": "Failed to clear language pack",
  "settings.language.placeholder": "/path/to/language.json",
  "settings.language.noFile": "No JSON file selected",
  "settings.language.paste": "Or paste JSON",
  "settings.language.pastePlaceholder": `{
  "meta": { "name": "Deutsch", "code": "de" },
  "strings": {
    "rail.overview": "Übersicht"
  }
}`,

  "whatsNew.kicker": "Release notes",
  "whatsNew.takeTour": "Walk through",
  "whatsNew.dismiss": "Got it",
  "whatsNew.closeOverlay": "Close release notes",
  "whatsNew.replay": "What's new",
  "whatsNew.tour": "Product tour",
  "whatsNew.tourHint": "Replay the guided walkthrough of this release.",

  "onboarding.kicker": "First launch",
  "onboarding.title": "Set up Pulse",
  "onboarding.summary": "Language, theme, start view, and the optional in-app agent. Change any of this later in Settings.",
  "onboarding.step": "Step {current} of {total}",
  "onboarding.language.title": "How should Pulse read?",
  "onboarding.language.hint": "Built-in English or Slovenčina. Match system follows the OS.",
  "onboarding.theme.title": "Pick a workspace skin",
  "onboarding.theme.hint": "Applies immediately. Settings → Appearance has the same picker.",
  "onboarding.workspace.title": "How the desk opens",
  "onboarding.workspace.hint": "A starting view. You can switch anytime from the rail.",
  "onboarding.home.overview": "Overview",
  "onboarding.home.overviewHint": "Saved requests and recent history",
  "onboarding.home.request": "Requests",
  "onboarding.home.requestHint": "URL bar, explorer, and the last tab",
  "onboarding.home.agent": "Agent",
  "onboarding.home.agentHint": "Local assistant for cURL, explain, and collection runs",
  "onboarding.home.agentOff": "Enable the agent (next step or Settings) to use this start view",
  "onboarding.explorer": "Start with explorer hidden",
  "onboarding.explorerHint": "Icon rail only until you open the panel. Same toggle as Settings → Layout.",
  "onboarding.back": "Back",
  "onboarding.next": "Next",
  "onboarding.finish": "Open Pulse",
  "onboarding.close": "Close setup",
  "onboarding.replay": "First-run setup",
  "onboarding.replayHint": "Replay language, theme, and start-view setup. The same controls live below.",

  "loading.app": "Loading app",
  "loading.view": "Loading view",
  "loading.start": "Starting Pulse",
  "loading.console": "Loading console",
  "loading.request": "Loading request",
  "loading.panel": "Loading panel",
  "loading.kicker": "Desk boot",
  "loading.method": "GET",
  "loading.path": "/workspace",
  "chrome.theme": "Theme",
  "chrome.language": "Language",
  "chrome.appearanceMore": "Language, CSS & appearance",
} as const;

export type MessageKey = keyof typeof EN_MESSAGES;

export const SK_MESSAGES: Record<MessageKey, string> = {
  "rail.overview": "Prehľad",
  "rail.requests": "Požiadavky",
  "rail.environments": "Prostredia",
  "rail.docs": "Dokumentácia",
  "rail.agent": "Agent",
  "rail.mcp": "MCP",
  "rail.settings": "Nastavenia",

  "view.overview.title": "Prehľad",
  "view.overview.description": "Nedávne požiadavky a uložené endpointy v pracovnom priestore.",
  "view.environments.title": "Prostredia",
  "view.environments.description": "Premenné pre URL, hlavičky, autentifikáciu a telá požiadaviek.",
  "view.docs.title": "Dokumentácia",
  "view.docs.description": "Sprievodca každou funkciou Pulse — požiadavky, autentifikácia, testy, témy a ďalšie.",
  "view.agent.title": "Agent",
  "view.agent.description": "Lokálny asistent na import cURL, vysvetlenie odpovede, stav workspace a beh kolekcií.",
  "view.mcp.title": "MCP",
  "view.mcp.description": "Prepoj Cursor s Pulse engine — setup, tools, prompty a bezpečnosť.",
  "view.settings.title": "Nastavenia",
  "view.settings.description": "Vzhľad, dáta, kolekcie a HTTP engine.",
  "view.explorer": "Prieskumník",
  "view.hideExplorer": "Skryť prieskumník",
  "view.newTab": "Nová karta požiadavky",
  "view.closeTab": "Zavrieť kartu",

  "window.overview": "Prehľad",
  "window.settings": "Nastavenia",
  "window.environments": "Prostredia",
  "window.docs": "Dokumentácia",
  "window.agent": "Agent",
  "window.mcp": "MCP",

  "agent.eyebrow": "Lokálny asistent",
  "agent.placeholder": "Skús: search history users, remember env=staging, recall env, list memory",
  "agent.send": "Odoslať",
  "agent.clear": "Vymazať chat",
  "agent.confirm": "Potvrdiť",
  "agent.cancel": "Zrušiť",
  "agent.quick.curl": "Import cURL",
  "agent.quick.explain": "Vysvetli poslednú odpoveď",
  "agent.quick.workspace": "Stav workspace",
  "agent.quick.run": "Spusti aktívnu kolekciu",
  "agent.quick.tests": "Vysvetli zlyhania testov",
  "agent.quick.history": "História agenta",
  "agent.quick.memory": "Zoznam pamäte",
  "agent.quick.rag": "Reindex RAG",
  "agent.empty": "Pýtaj sa prirodzene alebo použi rýchlu akciu. Mutujúce behy vyžadujú potvrdenie.",
  "agent.working": "Pracujem…",
  "agent.openRequest": "Otvoriť request",
  "agent.openMcp": "Cursor MCP most",
  "agent.settings.nav": "Agent / LLM",
  "agent.settings.title": "Agent a LLM",
  "agent.settings.description": "Zapni alebo vypni lokálneho asistenta a vyber, ktoré intentty smie spúšťať. Cloud LLM tool-calling príde neskôr.",
  "agent.settings.enabled": "Zapnúť in-app agenta",
  "agent.settings.enabledHint": "Zobrazí Agent v lište a command palette. Vypnuté skryje celý pohľad.",
  "agent.settings.capabilities": "Rozšíriť možnosti",
  "agent.settings.capabilitiesHint": "{enabled} z {total} intentov zapnutých — otvor a prepni každý zvlášť",
  "agent.settings.provider": "LLM poskytovateľ",
  "agent.settings.providerNone": "Žiadny (iba lokálne intentty)",
  "agent.settings.providerSoon": "Čoskoro",
  "agent.settings.apiKey": "API kľúč",
  "agent.settings.apiKeyHint": "Uložené na tomto zariadení pre budúci LLM backend. Zatiaľ sa nepoužíva.",
  "agent.settings.saved": "Nastavenia agenta uložené",
  "agent.settings.save": "Uložiť nastavenia agenta",
  "agent.disabled.title": "Agent je vypnutý",
  "agent.disabled.description": "Zapni in-app asistenta v Nastavenia → Agent / LLM, alebo pri úvodnom nastavení.",
  "agent.capability.import_curl": "Import cURL",
  "agent.capability.import_curlHint": "Vlož curl → otvor request tab",
  "agent.capability.explain_response": "Vysvetliť odpoveď",
  "agent.capability.explain_responseHint": "Zhrň poslednú odpoveď",
  "agent.capability.explain_tests": "Vysvetliť zlyhania testov",
  "agent.capability.explain_testsHint": "Prejdi posledný beh testov",
  "agent.capability.workspace_status": "Stav workspace",
  "agent.capability.workspace_statusHint": "Git root a čakajúce mutácie",
  "agent.capability.workspace_history": "História agenta",
  "agent.capability.workspace_historyHint": "Nedávne záznamy z .pulse/history.jsonl",
  "agent.capability.run_collection": "Spustiť kolekciu",
  "agent.capability.run_collectionHint": "Spusti aktívnu kolekciu (vyžaduje potvrdenie)",
  "agent.capability.graphql_summarize": "GraphQL zhrnutie",
  "agent.capability.graphql_summarizeHint": "Zhrň introspection payloady",
  "agent.capability.sse_parse": "Parsovať SSE",
  "agent.capability.sse_parseHint": "Parsuj vložené Server-Sent Events dokumenty",
  "agent.capability.memory": "Štruktúrovaná pamäť",
  "agent.capability.memoryHint": "Zapamätaj / vyvolaj / zabudni fakty vo workspace",
  "agent.capability.memory_rag": "RAG nad históriou",
  "agent.capability.memory_ragHint": "Hľadaj v histórii requestov + faktoch cez hashed n-gram TF-IDF",
  "agent.memory.title": "Pamäť",
  "agent.memory.description": "Workspace fakty idú do memory/facts.yaml. Lokálne fakty ostanú na tomto zariadení.",
  "agent.memory.count": "{count} faktov v indexe",
  "agent.memory.none": "Nie je pripojený workspace alebo je pamäť prázdna.",
  "agent.memory.refresh": "Reindexovať",
  "agent.memory.clearLocal": "Vymazať lokálne fakty",
  "agent.memory.cleared": "Vymazaných {count} lokálnych faktov",
  "agent.rag.title": "RAG index",
  "agent.rag.description": "Ľahké embeddingy nad históriou requestov a faktami — bez PyTorch. Filtre method:/status:/env:.",
  "agent.rag.count": "{count} dokumentov v indexe",
  "agent.rag.none": "Nie je pripojený workspace alebo je RAG index prázdny.",
  "agent.rag.refresh": "Obnoviť index",
  "agent.rag.prune": "Vyčistiť staré 4xx",
  "agent.rag.pruned": "Po prune: {count} dokumentov",
  "agent.settings.languageHint": "Jazyk UI berie app locale — Languages na raili alebo Nastavenia → Appearance.",
  "agent.md.helpIntro": "Rozumiem týmto intentom (lokálne, zatiaľ bez LLM):",
  "agent.md.helpOff": "In-app agent je **vypnutý**. Zapni ho v **Nastavenia → Agent / LLM**.",
  "agent.md.helpNone": "Agent je zapnutý, ale všetky možnosti sú vypnuté. Rozšír capabilities v **Nastavenia → Agent / LLM**.",
  "agent.md.helpFooter": "Alebo použi rýchle akcie nižšie.",
  "agent.md.cap.import_curl": "• **Import cURL** — vlož curl → otvorí request tab",
  "agent.md.cap.explain_response": "• **Vysvetli poslednú odpoveď** — status, body, GraphQL chyby",
  "agent.md.cap.explain_tests": "• **Vysvetli zlyhania testov** — prejdi posledný beh",
  "agent.md.cap.workspace_status": "• **Stav workspace** — Git root + čakajúce mutácie",
  "agent.md.cap.workspace_history": "• **História agenta** — záznamy z `.pulse/history.jsonl`",
  "agent.md.cap.run_collection": "• **Spusti aktívnu kolekciu** — vyžaduje potvrdenie",
  "agent.md.cap.graphql_summarize": "• **GraphQL zhrnutie** — introspection na aktívnom tabe",
  "agent.md.cap.sse_parse": "• **Parsovať SSE** — vlož SSE dokument",
  "agent.md.cap.memory": "• **Pamäť** — `remember key=value`, `recall key`, `forget key`, `list memory`",
  "agent.md.cap.memory_rag": "• **RAG** — `search history …` / `rag method:POST status:4xx …` (TF-IDF + filtre; `reindex rag`)",
  "agent.md.usageRemember": "Použitie: remember key=value  (voliteľne --local)",
  "agent.md.pasteCurl": "Vlož cURL príkaz (alebo ho zabal do ```bash bloku).",
  "agent.md.pasteSse": "Vlož SSE dokument na parsovanie (event/data bloky).",
  "agent.md.capabilityOff": "**{capability}** je vypnuté. Rozšír capabilities v **Nastavenia → Agent / LLM**.",
  "agent.md.parsedCurl": "Parsované **{method}** `{url}`.\n\nOtvoriť ako nový request tab?",
  "agent.md.curlFailed": "cURL sa nepodarilo parsovať: {error}",
  "agent.md.noResponse": "Na aktívnom tabe ešte nie je odpoveď. Najprv odošli request.",
  "agent.md.noTests": "Na aktívnom tabe nie sú výsledky testov. Spusti testy po odpovedi.",
  "agent.md.noWorkspace": "Nie je pripojený Git workspace. Nastav ho v **Nastavenia → Data & storage** (priečinok kolekcií).",
  "agent.md.noWorkspaceHistory": "Nie je pripojený Git workspace — nedá sa čítať `.pulse/history.jsonl`.",
  "agent.md.noWorkspaceMemory": "Nie je pripojený Git workspace — nedá sa vyvolať pamäť.",
  "agent.md.noWorkspaceForget": "Nie je pripojený Git workspace — nedá sa zabudnúť fakt.",
  "agent.md.noWorkspaceMemoryList": "Nie je pripojený Git workspace — zoznam pamäte je prázdny.",
  "agent.md.noWorkspaceRemember": "Nie je pripojený Git workspace. Nastav ho v **Nastavenia → Data & storage** pred zapamätaním faktov.",
  "agent.md.noWorkspaceRag": "Nie je pripojený Git workspace — nedá sa hľadať v RAG indexe.",
  "agent.md.noWorkspaceRagReindex": "Nie je pripojený Git workspace — nedá sa obnoviť RAG index.",
  "agent.md.workspaceLabel": "**Workspace:** `{root}`",
  "agent.md.pendingLabel": "**Čakajúce mutácie:** {count}",
  "agent.md.historyCountLabel": "**Záznamy histórie agenta:** {count}",
  "agent.md.workspaceFailed": "Stav workspace zlyhal: {error}",
  "agent.md.historyEmpty": "História agenta je prázdna.",
  "agent.md.historyRecent": "**Nedávna história agenta** (najnovšie prvé):",
  "agent.md.historyFailed": "Čítanie histórie zlyhalo: {error}",
  "agent.md.noCollection": "Žiadna aktívna kolekcia s requestami. Najprv vyber kolekciu v exploreri.",
  "agent.md.runReady": "Pripravené spustiť **{name}** ({count} requestov). Mutujúce metódy môžu trafiť API — potvrď pokračovanie.",
  "agent.md.noGraphqlBody": "Žiadne telo odpovede na zhrnutie. Najprv pošli introspection (alebo GraphQL odpoveď).",
  "agent.md.notGraphql": "Telo nie je GraphQL introspection. Tip: introspect v Docs / GraphQL exploreri a spýtaj sa znova.",
  "agent.md.noSse": "V dokumente som nenašiel žiadne SSE eventy.",
  "agent.md.sseParsed": "**Parsovaných {count} SSE event(ov):**",
  "agent.md.remembered": "Zapamätané `{key}` = {value} (`{scope}`).",
  "agent.md.rememberFailed": "Zapamätanie zlyhalo: {error}",
  "agent.md.usageRecall": "Použitie: recall <kľúč alebo hľadanie>",
  "agent.md.recallTitle": "Recall „{query}“",
  "agent.md.recallFailed": "Recall zlyhal: {error}",
  "agent.md.forgot": "Zabudnuté `{key}`.",
  "agent.md.forgetMissing": "Pre `{key}` som nenašiel pamäť.",
  "agent.md.forgetFailed": "Forget zlyhal: {error}",
  "agent.md.memoryTitle": "Pamäť agenta",
  "agent.md.memoryEmpty": "_(prázdne)_",
  "agent.md.memoryListFailed": "Zoznam pamäte zlyhal: {error}",
  "agent.md.usageRag": "Použitie: search history <dotaz>  ·  rag <dotaz>\n\nFiltre: `method:POST status:500 env:staging`",
  "agent.md.ragFailed": "RAG hľadanie zlyhalo: {error}",
  "agent.md.ragRebuilt": "RAG index obnovený s **{count}** dokumentmi (história + fakty).\n\n_Embedding runtime: hashed n-gram TF-IDF_",
  "agent.md.ragReindexFailed": "RAG reindex zlyhal: {error}",
  "agent.md.ragHits": "**RAG** pre „{query}“ ({count} zásah{plural})",
  "agent.md.ragNoHits": "**RAG** pre „{query}“\n\n_(žiadne zhody — skús reindex alebo širší dotaz)_",
  "agent.md.ragRuntime": "_Embedding runtime: hashed n-gram TF-IDF · filtre: `method:POST status:4xx env:staging`_",
  "agent.md.ragContext": "**Súvisiaci kontext** ({count} zásah{plural})",
  "agent.md.collectionGone": "Kolekcia už nie je dostupná.",
  "agent.md.collectionRun": "**Beh kolekcie:** {name}",
  "agent.md.collectionStats": "Kroky: {steps} · OK: {passed} · Zlyhania: {failed} · Testy: {tests}",
  "agent.md.statusLabel": "**Status:** {status}",
  "agent.md.timeSize": "**Čas:** {time} ms · **Veľkosť:** {size} B",
  "agent.md.cacheHit": "**Cache:** hit",
  "agent.md.bodyPreview": "**Náhľad tela:**",
  "agent.md.emptyBody": "(prázdne)",
  "agent.md.testsSummary": "**Testy:** {passed} OK · {failed} zlyhaní · {total} spolu",
  "agent.md.testsAllPassed": "Všetky asercie prešli.",
  "agent.md.testsFailures": "**Zlyhania:**",
  "onboarding.agent.title": "Agent v aplikácii",
  "onboarding.agent.hint": "Voliteľný lokálny asistent. Kedykoľvek ho vypneš, alebo rozšíriš, ktoré intentty smie použiť.",

  "mcp.eyebrow": "Agent most",
  "mcp.openDocs": "MCP v Docs",
  "mcp.openCliDocs": "Python CLI docs",
  "mcp.onThisPage": "Na tejto stránke",
  "mcp.copy": "Kopírovať",
  "mcp.copied": "Skopírované",
  "mcp.copyFailed": "Nepodarilo sa skopírovať",

  "auth.headline": "Tvoj API workspace, lokálne.",
  "auth.subhead": "Kolekcie, prostredia, história a testy — v jednom rýchlom desktopovom klientovi.",
  "auth.feature.http": "Posielaj HTTP, GraphQL a WebSocket požiadavky",
  "auth.feature.local": "Workspace ostáva na tomto zariadení",
  "auth.stays": "Dáta ostávajú na tomto zariadení",
  "auth.privacy": "Účty sú len lokálne. Žiadny Pulse cloud — privacy policy nájdeš v Docs po prihlásení.",
  "auth.welcome": "Vitaj späť",
  "auth.create": "Vytvoriť účet",
  "auth.signInLead": "Prihlás sa a otvor workspace.",
  "auth.registerLead": "Zaregistruj sa a začni.",
  "auth.login": "Prihlásenie",
  "auth.register": "Registrácia",
  "auth.fullName": "Meno a priezvisko",
  "auth.email": "E-mail",
  "auth.password": "Heslo",
  "auth.confirmPassword": "Potvrď heslo",
  "auth.passwordPlaceholder": "Tvoje heslo",
  "auth.passwordNewPlaceholder": "Aspoň 6 znakov",
  "auth.confirmPlaceholder": "Zopakuj heslo",
  "auth.signIn": "Prihlásiť sa",
  "auth.createAccount": "Vytvoriť účet",
  "auth.noAccount": "Ešte nemáš účet?",
  "auth.hasAccount": "Už máš účet?",
  "auth.signInFailed": "Prihlásenie zlyhalo",
  "auth.registerFailed": "Registrácia zlyhala",

  "settings.nav.appearance": "Vzhľad",
  "settings.nav.data": "Dáta a úložisko",
  "settings.nav.http": "HTTP engine",
  "settings.nav.layout": "Rozloženie",
  "settings.nav.cookies": "Cookie jar",
  "settings.nav.collections": "Kolekcie",
  "settings.nav.folders": "Priečinky",
  "settings.nav.aria": "Sekcie nastavení",
  "settings.sections": "Sekcie",
  "settings.appearance.title": "Vzhľad",
  "settings.appearance.description": `Vyber, ako ${APP_NAME} vyzerá a v akom jazyku čítaš na tomto zariadení.`,

  "settings.language.title": "Jazyk",
  "settings.language.hint":
    "Vstavaný jazyk rozhrania. Vlastný JSON pretiahne ktorýkoľvek reťazec; chýbajúce kľúče padnú sem.",
  "settings.language.system": "Podľa systému",
  "settings.language.en": "English",
  "settings.language.sk": "Slovenčina",
  "settings.language.systemHint": "Použije jazyk systému, ak ho Pulse pozná; inak angličtinu.",
  "settings.language.customTitle": "Vlastný jazykový balík",
  "settings.language.customHint":
    "Nahraj JSON objekt pretiahnutých reťazcov (kľúč → text). Chýbajúce kľúče padnú na jazyk vyššie.",
  "settings.language.browse": "Prehľadávať",
  "settings.language.export": "Exportovať šablónu",
  "settings.language.clear": "Vymazať",
  "settings.language.reload": "Znova načítať",
  "settings.language.load": "Načítať súbor",
  "settings.language.apply": "Použiť JSON",
  "settings.language.loaded": "Načítaných {count} kľúčov z {name}",
  "settings.language.empty": "Žiadny vlastný balík — Pulse používa vstavaný jazyk.",
  "settings.language.keys": "{count} kľúčov",
  "settings.language.path": "Načítať zo súboru",
  "settings.language.browserHint":
    "V prehliadači sa balík uloží lokálne. V desktopovej aplikácii ostane cesta k súboru a môžeš ho znova načítať z disku.",
  "settings.language.removed": "Vlastný jazykový balík odstránený",
  "settings.language.applied": "Vlastný jazykový balík načítaný",
  "settings.language.exported": "Šablóna exportovaná",
  "settings.language.loadFailed": "Jazykový balík sa nepodarilo načítať",
  "settings.language.clearFailed": "Jazykový balík sa nepodarilo vymazať",
  "settings.language.placeholder": "/path/to/language.json",
  "settings.language.noFile": "Žiadny JSON súbor",
  "settings.language.paste": "Alebo vlož JSON",
  "settings.language.pastePlaceholder": `{
  "meta": { "name": "Deutsch", "code": "de" },
  "strings": {
    "rail.overview": "Übersicht"
  }
}`,

  "whatsNew.kicker": "Poznámky k verzii",
  "whatsNew.takeTour": "Prejsť zmeny",
  "whatsNew.dismiss": "Rozumiem",
  "whatsNew.closeOverlay": "Zavrieť poznámky",
  "whatsNew.replay": "Novinky",
  "whatsNew.tour": "Prehliadka produktu",
  "whatsNew.tourHint": "Znova spustiť sprievodcu touto verziou.",

  "onboarding.kicker": "Prvé spustenie",
  "onboarding.title": "Nastav si Pulse",
  "onboarding.summary": "Jazyk, téma, úvodný pohľad a voliteľný in-app agent. Neskôr to zmeníš v Nastaveniach.",
  "onboarding.step": "Krok {current} z {total}",
  "onboarding.language.title": "V akom jazyku má Pulse čítať?",
  "onboarding.language.hint": "Vstavaná angličtina alebo slovenčina. Systém berie jazyk OS.",
  "onboarding.theme.title": "Vyber si tému",
  "onboarding.theme.hint": "Platí hneď. Rovnaký výber je v Nastavenia → Vzhľad.",
  "onboarding.workspace.title": "Ako sa otvorí stôl",
  "onboarding.workspace.hint": "Úvodný pohľad. Kedykoľvek ho prepneš z lišty vľavo.",
  "onboarding.home.overview": "Prehľad",
  "onboarding.home.overviewHint": "Uložené requesty a nedávna história",
  "onboarding.home.request": "Požiadavky",
  "onboarding.home.requestHint": "URL lišta, explorer a posledný tab",
  "onboarding.home.agent": "Agent",
  "onboarding.home.agentHint": "Lokálny asistent na cURL, vysvetlenie a beh kolekcií",
  "onboarding.home.agentOff": "Na tento úvodný pohľad najprv zapni agenta (ďalší krok alebo Nastavenia)",
  "onboarding.explorer": "Začať so skrytým explorerom",
  "onboarding.explorerHint": "Len ikonová lišta, kým panel neotvoríš. Rovnaký prepínač je v Nastavenia → Rozloženie.",
  "onboarding.back": "Späť",
  "onboarding.next": "Ďalej",
  "onboarding.finish": "Otvoriť Pulse",
  "onboarding.close": "Zavrieť nastavenie",
  "onboarding.replay": "Úvodné nastavenie",
  "onboarding.replayHint": "Znova prejsť jazyk, tému a úvodný pohľad. Tie isté ovládania sú nižšie.",

  "loading.app": "Načítavam aplikáciu",
  "loading.view": "Načítavam pohľad",
  "loading.start": "Spúšťam Pulse",
  "loading.console": "Načítavam konzolu",
  "loading.request": "Načítavam požiadavku",
  "loading.panel": "Načítavam panel",
  "loading.kicker": "Štart stola",
  "loading.method": "GET",
  "loading.path": "/workspace",
  "chrome.theme": "Téma",
  "chrome.language": "Jazyk",
  "chrome.appearanceMore": "Jazyk, CSS a vzhľad",
};

const CATALOGS: Record<BuiltInLocale, Record<MessageKey, string>> = {
  en: EN_MESSAGES,
  sk: SK_MESSAGES,
};

export type LanguagePackMeta = {
  name: string;
  code: string;
};

export type LanguagePack = {
  meta: LanguagePackMeta;
  strings: Record<string, string>;
};

const LOCALE_STORAGE_SUFFIX = "locale";
const PACK_CONTENT_SUFFIX = "custom-language-json";
const PACK_PATH_SUFFIX = "custom-language-json-path";

let locale: LocalePreference = "system";
let pack: LanguagePack | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeI18n(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getI18nVersion(): number {
  return version;
}

export function isLocalePreference(value: string): value is LocalePreference {
  return (LOCALE_PREFERENCES as readonly string[]).includes(value);
}

export function isBuiltInLocale(value: string): value is BuiltInLocale {
  return (BUILTIN_LOCALES as readonly string[]).includes(value);
}

function readStoredLocale(): LocalePreference {
  try {
    const value = readStorageItem(LOCALE_STORAGE_SUFFIX);
    if (value && isLocalePreference(value)) return value;
  } catch {
    // ignore storage errors
  }
  return "system";
}

function readStoredPack(): LanguagePack | null {
  try {
    const raw = readStorageItem(PACK_CONTENT_SUFFIX);
    if (!raw?.trim()) return null;
    return parseLanguagePack(raw);
  } catch {
    return null;
  }
}

export function getLocale(): LocalePreference {
  return locale;
}

export function getResolvedLocale(): BuiltInLocale {
  return resolveLocale(locale);
}

export function getCustomLanguagePack(): LanguagePack | null {
  return pack;
}

export function getBrowserCustomLanguagePath(): string | null {
  return readStorageItem(PACK_PATH_SUFFIX);
}

export function resolveLocale(preference: LocalePreference): BuiltInLocale {
  if (preference === "en" || preference === "sk") return preference;
  const language =
    typeof navigator === "undefined" ? "en" : navigator.language || navigator.languages?.[0] || "en";
  const base = language.toLowerCase().split("-")[0];
  return base === "sk" ? "sk" : "en";
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const overlay = pack?.strings[key];
  const resolved = resolveLocale(locale);
  const raw = overlay || CATALOGS[resolved][key] || EN_MESSAGES[key] || key;
  return interpolate(raw, vars);
}

export function applyDocumentLang(): void {
  if (typeof document === "undefined") return;
  const htmlLang = pack?.meta.code.trim() || getResolvedLocale();
  document.documentElement.lang = htmlLang;
}

export function setLocale(next: LocalePreference, options?: { persist?: boolean }): void {
  locale = next;
  if (options?.persist !== false) {
    writeStorageItem(LOCALE_STORAGE_SUFFIX, next);
  }
  applyDocumentLang();
  emit();
}

export function hydrateLocale(next: string): void {
  if (!isLocalePreference(next)) return;
  setLocale(next, { persist: true });
}

export function applyCustomLanguagePack(next: LanguagePack | null, path?: string | null): void {
  if (!next) {
    clearCustomLanguagePackState();
    return;
  }

  pack = next;
  writeStorageItem(PACK_CONTENT_SUFFIX, serializeLanguagePack(next));
  if (path !== undefined) {
    if (path?.trim()) writeStorageItem(PACK_PATH_SUFFIX, path.trim());
    else removeStorageItem(PACK_PATH_SUFFIX);
  }
  applyDocumentLang();
  emit();
}

export function saveCustomLanguagePath(path: string): void {
  writeStorageItem(PACK_PATH_SUFFIX, path);
}

export function clearCustomLanguagePackState(): void {
  pack = null;
  removeStorageItem(PACK_CONTENT_SUFFIX);
  removeStorageItem(PACK_PATH_SUFFIX);
  applyDocumentLang();
  emit();
}

export function parseLanguagePack(raw: string): LanguagePack {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Language file is not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Language file must be a JSON object");
  }

  const record = value as Record<string, unknown>;
  const metaRaw = record.meta;
  const stringsSource =
    record.strings && typeof record.strings === "object" && !Array.isArray(record.strings)
      ? (record.strings as Record<string, unknown>)
      : record;

  const strings: Record<string, string> = {};
  for (const [key, text] of Object.entries(stringsSource)) {
    if (key === "meta" || key === "strings") continue;
    if (typeof text === "string" && text.length > 0) {
      strings[key] = text;
    }
  }

  if (Object.keys(strings).length === 0) {
    throw new Error("Language file has no string keys");
  }

  let name = "Custom";
  let code = "";
  if (metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)) {
    const meta = metaRaw as Record<string, unknown>;
    if (typeof meta.name === "string" && meta.name.trim()) name = meta.name.trim();
    if (typeof meta.code === "string") code = meta.code.trim();
  }

  return { meta: { name, code }, strings };
}

export function serializeLanguagePack(next: LanguagePack): string {
  return `${JSON.stringify(
    {
      meta: next.meta,
      strings: next.strings,
    },
    null,
    2,
  )}\n`;
}

export function languagePackTemplate(): LanguagePack {
  return {
    meta: { name: "English (template)", code: "en" },
    strings: { ...EN_MESSAGES },
  };
}

export function languagePackTemplateJson(): string {
  return serializeLanguagePack(languagePackTemplate());
}

export function bootstrapLocale(): void {
  locale = readStoredLocale();
  pack = readStoredPack();
  applyDocumentLang();
}
