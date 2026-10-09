import { readStorageItem, writeStorageItem } from "@/lib/app-config";

const KEY = "agent-settings-v1";
const LEGACY_LLM_KEY = "agent-llm-v1";

export const AGENT_SETTINGS_EVENT = "pulse:agent-settings";

export const AGENT_CAPABILITIES = [
  "import_curl",
  "explain_response",
  "explain_tests",
  "workspace_status",
  "workspace_history",
  "run_collection",
  "graphql_summarize",
  "sse_parse",
  "memory",
  "memory_rag",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export type AgentLlmProvider = "none" | "openai" | "anthropic";

export type AgentSettings = {
  enabled: boolean;
  capabilities: Record<AgentCapability, boolean>;
  provider: AgentLlmProvider;
  apiKey: string;
};

/** @deprecated Prefer AgentSettings — kept for existing imports. */
export type AgentLlmSettings = Pick<AgentSettings, "provider" | "apiKey">;

const ALL_ON = Object.fromEntries(AGENT_CAPABILITIES.map((id) => [id, true])) as Record<
  AgentCapability,
  boolean
>;

const DEFAULTS: AgentSettings = {
  enabled: true,
  capabilities: { ...ALL_ON },
  provider: "none",
  apiKey: "",
};

function normalizeCapabilities(
  raw: Partial<Record<AgentCapability, boolean>> | undefined,
): Record<AgentCapability, boolean> {
  const next = { ...ALL_ON };
  if (!raw || typeof raw !== "object") return next;
  for (const id of AGENT_CAPABILITIES) {
    if (typeof raw[id] === "boolean") next[id] = raw[id]!;
  }
  return next;
}

function parseSettings(raw: string | null): AgentSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AgentSettings> & {
      provider?: string;
      apiKey?: string;
    };
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULTS.enabled,
      capabilities: normalizeCapabilities(parsed.capabilities),
      provider:
        parsed.provider === "openai" || parsed.provider === "anthropic" ? parsed.provider : "none",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch {
    return null;
  }
}

export function defaultAgentSettings(): AgentSettings {
  return {
    enabled: DEFAULTS.enabled,
    capabilities: { ...ALL_ON },
    provider: DEFAULTS.provider,
    apiKey: DEFAULTS.apiKey,
  };
}

export function loadAgentSettings(): AgentSettings {
  try {
    const rawCurrent = readStorageItem(KEY);
    if (rawCurrent != null) {
      return parseSettings(rawCurrent) ?? defaultAgentSettings();
    }

    const legacyRaw = readStorageItem(LEGACY_LLM_KEY);
    if (legacyRaw != null) {
      const legacy = parseSettings(legacyRaw);
      const migrated: AgentSettings = {
        ...defaultAgentSettings(),
        provider: legacy?.provider ?? "none",
        apiKey: legacy?.apiKey ?? "",
      };
      writeStorageItem(KEY, JSON.stringify(migrated));
      return migrated;
    }
    return defaultAgentSettings();
  } catch {
    return defaultAgentSettings();
  }
}

export function saveAgentSettings(patch: Partial<AgentSettings>): AgentSettings {
  const current = loadAgentSettings();
  const next: AgentSettings = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    capabilities: patch.capabilities
      ? normalizeCapabilities(patch.capabilities)
      : current.capabilities,
    provider:
      patch.provider === "openai" || patch.provider === "anthropic" || patch.provider === "none"
        ? patch.provider
        : current.provider,
    apiKey: typeof patch.apiKey === "string" ? patch.apiKey : current.apiKey,
  };
  writeStorageItem(KEY, JSON.stringify(next));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AGENT_SETTINGS_EVENT));
  }
  return next;
}

export function isAgentEnabled(settings = loadAgentSettings()): boolean {
  return settings.enabled;
}

export function isAgentCapabilityEnabled(
  capability: AgentCapability,
  settings = loadAgentSettings(),
): boolean {
  return settings.enabled && settings.capabilities[capability] !== false;
}

export function capabilityForIntent(
  kind: string,
): AgentCapability | null {
  if (
    kind === "remember" ||
    kind === "recall" ||
    kind === "forget" ||
    kind === "memory_list"
  ) {
    return "memory";
  }
  if (kind === "rag_search" || kind === "rag_reindex") {
    return "memory_rag";
  }
  if ((AGENT_CAPABILITIES as readonly string[]).includes(kind)) {
    return kind as AgentCapability;
  }
  return null;
}

/** @deprecated Use loadAgentSettings(). */
export function loadAgentLlmSettings(): AgentLlmSettings {
  const settings = loadAgentSettings();
  return { provider: settings.provider, apiKey: settings.apiKey };
}

/** @deprecated Use saveAgentSettings(). */
export function saveAgentLlmSettings(settings: AgentLlmSettings): void {
  saveAgentSettings({ provider: settings.provider, apiKey: settings.apiKey });
}
