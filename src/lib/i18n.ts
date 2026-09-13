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
  "rail.settings": "Settings",

  "view.overview.title": "Overview",
  "view.overview.description": "Recent requests and saved endpoints across your workspace.",
  "view.environments.title": "Environments",
  "view.environments.description": "Variables for URLs, headers, auth, and bodies.",
  "view.docs.title": "Docs",
  "view.docs.description": "Guides for every Pulse feature — requests, auth, tests, themes, and more.",
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

  "auth.headline": "Your API workspace, locally.",
  "auth.subhead": "Collections, environments, history, and tests — all in one fast desktop client.",
  "auth.feature.http": "Send HTTP, GraphQL, and WebSocket requests",
  "auth.feature.local": "Local-first workspaces stored on your device",
  "auth.stays": "Data stays on this device",
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

  "loading.app": "Loading app",
  "loading.view": "Loading view",
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
  "rail.settings": "Nastavenia",

  "view.overview.title": "Prehľad",
  "view.overview.description": "Nedávne požiadavky a uložené endpointy v pracovnom priestore.",
  "view.environments.title": "Prostredia",
  "view.environments.description": "Premenné pre URL, hlavičky, autentifikáciu a telá požiadaviek.",
  "view.docs.title": "Dokumentácia",
  "view.docs.description": "Sprievodca každou funkciou Pulse — požiadavky, autentifikácia, testy, témy a ďalšie.",
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

  "auth.headline": "Tvoj API workspace, lokálne.",
  "auth.subhead": "Kolekcie, prostredia, história a testy — v jednom rýchlom desktopovom klientovi.",
  "auth.feature.http": "Posielaj HTTP, GraphQL a WebSocket požiadavky",
  "auth.feature.local": "Workspace ostáva na tomto zariadení",
  "auth.stays": "Dáta ostávajú na tomto zariadení",
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

  "loading.app": "Načítavam aplikáciu",
  "loading.view": "Načítavam pohľad",
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
