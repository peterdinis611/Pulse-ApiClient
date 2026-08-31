export type CustomCssSnippet = {
  id: string;
  label: string;
  description: string;
  css: string;
};

export type CustomCssTokenGroup = {
  id: string;
  label: string;
  tokens: Array<{ name: string; hint: string }>;
};

/** One-click CSS blocks appended into the custom theme editor. */
export const CUSTOM_CSS_SNIPPETS: CustomCssSnippet[] = [
  {
    id: "accent-teal",
    label: "Teal accent",
    description: "Primary brand color",
    css: `:root {
  --primary: oklch(0.52 0.13 205);
  --primary-foreground: oklch(0.99 0 0);
  --ring: oklch(0.52 0.13 205);
  --sidebar-primary: oklch(0.52 0.13 205);
  --sidebar-ring: oklch(0.52 0.13 205);
}`,
  },
  {
    id: "accent-coral",
    label: "Coral accent",
    description: "Warm primary",
    css: `:root {
  --primary: oklch(0.58 0.16 35);
  --primary-foreground: oklch(0.99 0 0);
  --ring: oklch(0.58 0.16 35);
  --sidebar-primary: oklch(0.58 0.16 35);
  --sidebar-ring: oklch(0.58 0.16 35);
}`,
  },
  {
    id: "density-compact",
    label: "Compact density",
    description: "Tighter radius & tracking",
    css: `:root {
  --radius: 0.25rem;
  --tracking-normal: 0;
}`,
  },
  {
    id: "density-soft",
    label: "Soft density",
    description: "Rounder UI",
    css: `:root {
  --radius: 0.85rem;
}`,
  },
  {
    id: "chrome-contrast",
    label: "Chrome contrast",
    description: "Stronger borders",
    css: `:root {
  --border: oklch(0.78 0.02 210);
  --input: oklch(0.84 0.015 210);
  --sidebar-border: oklch(0.78 0.02 210);
  --rail-border: oklch(0.78 0.02 210);
  --topbar-border: oklch(0.78 0.02 210);
}`,
  },
  {
    id: "methods-vivid",
    label: "Vivid methods",
    description: "HTTP method colors",
    css: `:root {
  --method-get: oklch(0.5 0.17 155);
  --method-post: oklch(0.56 0.18 55);
  --method-put: oklch(0.5 0.16 255);
  --method-patch: oklch(0.52 0.16 310);
  --method-delete: oklch(0.5 0.2 25);
  --method-query: oklch(0.5 0.16 275);
  --method-head: oklch(0.5 0.05 240);
  --method-options: oklch(0.5 0.05 80);
  --method-get-bg: oklch(0.5 0.17 155 / 0.14);
  --method-post-bg: oklch(0.56 0.18 55 / 0.14);
  --method-put-bg: oklch(0.5 0.16 255 / 0.14);
  --method-patch-bg: oklch(0.52 0.16 310 / 0.14);
  --method-delete-bg: oklch(0.5 0.2 25 / 0.14);
  --method-query-bg: oklch(0.5 0.16 275 / 0.14);
  --method-head-bg: oklch(0.5 0.05 240 / 0.12);
  --method-options-bg: oklch(0.5 0.05 80 / 0.12);
}`,
  },
  {
    id: "fonts-plex",
    label: "IBM Plex fonts",
    description: "Sans + mono stack",
    css: `:root {
  --font-sans: "IBM Plex Sans", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
}`,
  },
  {
    id: "component-pill-url",
    label: "Pill URL bar",
    description: "Rounded request URL",
    css: `.request-url-composite {
  border-radius: 999px;
  border-color: color-mix(in oklch, var(--primary) 28%, var(--border));
}`,
  },
  {
    id: "component-explorer",
    label: "Explorer selection",
    description: "Stronger active row",
    css: `.explorer-row--active {
  background: color-mix(in oklch, var(--primary) 16%, var(--sidebar-accent));
  border-left: 3px solid var(--primary);
  padding-left: calc(0.5rem - 3px);
}

.explorer-tree-row--active {
  background: color-mix(in oklch, var(--primary) 14%, var(--sidebar-accent));
  border-left: 3px solid var(--primary);
}`,
  },
  {
    id: "component-status",
    label: "Status chips",
    description: "Pill status bar chips",
    css: `.status-chip {
  border-radius: 999px;
  font-weight: 600;
}

.status-chip--active {
  background: color-mix(in oklch, var(--primary) 14%, var(--accent));
  border-color: color-mix(in oklch, var(--primary) 35%, transparent);
}`,
  },
  {
    id: "component-workspace",
    label: "Workspace wash",
    description: "Primary gradient backdrop",
    css: `.workspace-surface {
  background:
    radial-gradient(
      ellipse 70% 45% at 8% 0%,
      color-mix(in oklch, var(--primary) 14%, transparent),
      transparent 55%
    ),
    var(--workspace-gradient);
}`,
  },
  {
    id: "theme-dark-only",
    label: "Dark theme only",
    description: "Scoped dark overrides",
    css: `html[data-theme="dark"] {
  --primary: oklch(0.72 0.12 195);
  --background: oklch(0.12 0.012 210);
  --card: oklch(0.16 0.014 210);
  --sidebar: oklch(0.1 0.01 218);
  --rail: oklch(0.09 0.01 218);
  --topbar: oklch(0.11 0.01 218);
}`,
  },
];

export const CUSTOM_CSS_TOKEN_GROUPS: CustomCssTokenGroup[] = [
  {
    id: "brand",
    label: "Brand",
    tokens: [
      { name: "--primary", hint: "Buttons, accents" },
      { name: "--primary-foreground", hint: "Text on primary" },
      { name: "--ring", hint: "Focus ring" },
      { name: "--destructive", hint: "Errors / danger" },
      { name: "--success", hint: "Success state" },
      { name: "--warning", hint: "Warning state" },
      { name: "--info", hint: "Info state" },
    ],
  },
  {
    id: "surfaces",
    label: "Surfaces",
    tokens: [
      { name: "--background", hint: "App background" },
      { name: "--foreground", hint: "Main text" },
      { name: "--card", hint: "Cards / panels" },
      { name: "--muted", hint: "Muted fills" },
      { name: "--muted-foreground", hint: "Secondary text" },
      { name: "--border", hint: "Borders" },
      { name: "--input", hint: "Input borders" },
      { name: "--accent", hint: "Hover accents" },
    ],
  },
  {
    id: "chrome",
    label: "Chrome",
    tokens: [
      { name: "--sidebar", hint: "Explorer background" },
      { name: "--sidebar-border", hint: "Explorer border" },
      { name: "--rail", hint: "Left rail" },
      { name: "--topbar", hint: "Top bar" },
      { name: "--console", hint: "Bottom console" },
      { name: "--surface-0", hint: "Workspace layer 0" },
      { name: "--surface-1", hint: "Workspace layer 1" },
    ],
  },
  {
    id: "methods",
    label: "Methods",
    tokens: [
      { name: "--method-get", hint: "GET" },
      { name: "--method-post", hint: "POST" },
      { name: "--method-put", hint: "PUT" },
      { name: "--method-patch", hint: "PATCH" },
      { name: "--method-delete", hint: "DELETE" },
      { name: "--method-query", hint: "QUERY" },
    ],
  },
  {
    id: "shape",
    label: "Shape & type",
    tokens: [
      { name: "--radius", hint: "Corner radius" },
      { name: "--font-sans", hint: "UI font" },
      { name: "--font-mono", hint: "Code font" },
      { name: "--tracking-normal", hint: "Letter spacing" },
    ],
  },
];

export const CUSTOM_CSS_COMPONENT_HOOKS = [
  { name: ".request-url-composite", hint: "URL bar" },
  { name: ".request-tab--active", hint: "Active request tab" },
  { name: ".explorer-row--active", hint: "Active explorer request" },
  { name: ".explorer-tree-row--active", hint: "Active tree row" },
  { name: ".status-chip", hint: "Status bar chip" },
  { name: ".rail-active-indicator", hint: "Left rail active" },
  { name: ".workspace-surface", hint: "Main workspace" },
  { name: ".method-badge-get", hint: "GET badge" },
  { name: ".ui-panel", hint: "Generic panel" },
  { name: ".response-toolbar", hint: "Response toolbar" },
] as const;

export function appendCssBlock(current: string, block: string): string {
  const trimmedCurrent = current.trimEnd();
  const trimmedBlock = block.trim();
  if (!trimmedBlock) return current;
  if (!trimmedCurrent) return `${trimmedBlock}\n`;
  if (trimmedCurrent.includes(trimmedBlock)) return current;
  return `${trimmedCurrent}\n\n${trimmedBlock}\n`;
}

export function insertCssToken(current: string, token: string): string {
  const line = `  ${token}: /* value */;\n`;
  const rootOpen = current.indexOf(":root");
  if (rootOpen === -1) {
    return appendCssBlock(current, `:root {\n${line}}`);
  }

  const braceOpen = current.indexOf("{", rootOpen);
  if (braceOpen === -1) {
    return appendCssBlock(current, `:root {\n${line}}`);
  }

  const before = current.slice(0, braceOpen + 1);
  const after = current.slice(braceOpen + 1);
  if (after.includes(`${token}:`)) return current;
  return `${before}\n${line}${after}`;
}
