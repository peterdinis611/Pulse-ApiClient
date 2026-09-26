import { FEATURE_DOC_SECTIONS } from "@/lib/feature-docs";
import { fuzzyRankIds, type SearchDocument } from "@/lib/fuzzy-search";
import type { CollectionGroup, Environment, SavedRequest } from "@/types";

export type CommandPaletteKind =
  | "view"
  | "request"
  | "collection"
  | "environment"
  | "settings"
  | "docs"
  | "action";

export type CommandPaletteItem = SearchDocument & {
  kind: CommandPaletteKind;
  view?: "overview" | "request" | "environments" | "settings" | "docs" | "mcp";
  savedRequestId?: string;
  collectionId?: string;
  environmentId?: string;
  settingsSection?: string;
  docsSection?: string;
  action?: "new-request" | "toggle-explorer" | "toggle-console" | "whats-new" | "product-tour" | "onboarding";
};

const SETTINGS_SECTIONS: Array<{ id: string; title: string; subtitle: string }> = [
  { id: "appearance", title: "Appearance", subtitle: "Theme, language, custom CSS" },
  { id: "data", title: "Data & storage", subtitle: "Git workspace, database, cache" },
  { id: "http", title: "HTTP engine", subtitle: "TLS, proxy, mTLS, timeouts" },
  { id: "layout", title: "Layout", subtitle: "Explorer, shortcuts" },
  { id: "cookies", title: "Cookie jar", subtitle: "Stored cookies" },
  { id: "collections", title: "Collections", subtitle: "Import and export" },
  { id: "folders", title: "Folders", subtitle: "Collection folders" },
];

const VIEWS: CommandPaletteItem[] = [
  {
    id: "view:overview",
    kind: "view",
    title: "Overview",
    subtitle: "Recent requests and saved endpoints",
    method: "",
    meta: "Go",
    view: "overview",
    keywords: "home dashboard",
  },
  {
    id: "view:request",
    kind: "view",
    title: "Requests",
    subtitle: "Request workspace",
    method: "",
    meta: "Go",
    view: "request",
    keywords: "http graphql send",
  },
  {
    id: "view:environments",
    kind: "view",
    title: "Environments",
    subtitle: "Variables and secrets",
    method: "",
    meta: "Go",
    view: "environments",
    keywords: "vars globals",
  },
  {
    id: "view:docs",
    kind: "view",
    title: "Docs",
    subtitle: "Field manual",
    method: "",
    meta: "Go",
    view: "docs",
    keywords: "help guide",
  },
  {
    id: "view:mcp",
    kind: "view",
    title: "MCP",
    subtitle: "Cursor agent bridge — setup and how-to",
    method: "",
    meta: "Go",
    view: "mcp",
    keywords: "cursor agent tools pulse_workspace",
  },
  {
    id: "view:settings",
    kind: "view",
    title: "Settings",
    subtitle: "Appearance, HTTP engine, data",
    method: "",
    meta: "Go",
    view: "settings",
    keywords: "prefs config",
  },
];

const ACTIONS: CommandPaletteItem[] = [
  {
    id: "action:new-request",
    kind: "action",
    title: "New request tab",
    subtitle: "Open a blank request",
    method: "",
    meta: "Action",
    action: "new-request",
    keywords: "create tab",
  },
  {
    id: "action:toggle-explorer",
    kind: "action",
    title: "Toggle explorer",
    subtitle: "Show or hide the sidebar",
    method: "",
    meta: "Action",
    action: "toggle-explorer",
    keywords: "sidebar collections",
  },
  {
    id: "action:toggle-console",
    kind: "action",
    title: "Toggle console",
    subtitle: "Show or hide the bottom console",
    method: "",
    meta: "Action",
    action: "toggle-console",
    keywords: "logs eval",
  },
  {
    id: "action:whats-new",
    kind: "action",
    title: "What's new",
    subtitle: "Release notes for this version",
    method: "",
    meta: "Action",
    action: "whats-new",
    keywords: "changelog release notes version tour",
  },
  {
    id: "action:product-tour",
    kind: "action",
    title: "Product tour",
    subtitle: "Walk through Git workspace and 2.0 changes",
    method: "",
    meta: "Action",
    action: "product-tour",
    keywords: "driver walkthrough git yaml mock openapi",
  },
  {
    id: "action:onboarding",
    kind: "action",
    title: "First-run setup",
    subtitle: "Replay language, theme, and start view",
    method: "",
    meta: "Action",
    action: "onboarding",
    keywords: "onboarding welcome language theme appearance setup",
  },
];

export function buildCommandPaletteItems(input: {
  collections: SavedRequest[];
  collectionGroups: CollectionGroup[];
  environments: Environment[];
}): CommandPaletteItem[] {
  const requests: CommandPaletteItem[] = input.collections.map((saved) => ({
    id: `request:${saved.id}`,
    kind: "request",
    title: saved.name || saved.request.name,
    subtitle: saved.request.url,
    method: saved.request.method,
    meta: "Request",
    savedRequestId: saved.id,
    collectionId: saved.collectionId,
    keywords: `${saved.request.method} ${saved.folder ?? ""}`,
  }));

  const groups: CommandPaletteItem[] = input.collectionGroups.map((group) => ({
    id: `collection:${group.id}`,
    kind: "collection",
    title: group.name,
    subtitle: "Open collection in explorer",
    method: "",
    meta: "Collection",
    collectionId: group.id,
    view: "request",
    keywords: group.source ?? "pulse",
  }));

  const envs: CommandPaletteItem[] = input.environments.map((env) => ({
    id: `env:${env.id}`,
    kind: "environment",
    title: env.name,
    subtitle: "Switch environment",
    method: "",
    meta: "Environment",
    environmentId: env.id,
    view: "environments",
    keywords: "variables secrets",
  }));

  const settings: CommandPaletteItem[] = SETTINGS_SECTIONS.map((section) => ({
    id: `settings:${section.id}`,
    kind: "settings",
    title: section.title,
    subtitle: section.subtitle,
    method: "",
    meta: "Settings",
    view: "settings",
    settingsSection: section.id,
    keywords: section.subtitle,
  }));

  const docs: CommandPaletteItem[] = FEATURE_DOC_SECTIONS.map((section) => ({
    id: `docs:${section.id}`,
    kind: "docs",
    title: section.title,
    subtitle: section.summary,
    method: "",
    meta: section.group,
    view: "docs",
    docsSection: section.id,
    keywords: `${section.group} ${section.items.slice(0, 4).join(" ")}`,
  }));

  return [...ACTIONS, ...VIEWS, ...settings, ...groups, ...envs, ...requests, ...docs];
}

export function filterCommandPaletteItems(
  items: CommandPaletteItem[],
  query: string,
  limit = 40,
): CommandPaletteItem[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.filter((item) => item.kind !== "request" && item.kind !== "docs").slice(0, 18);
  }
  const ranked = fuzzyRankIds(items, trimmed, limit);
  const byId = new Map(items.map((item) => [item.id, item]));
  return ranked.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}
