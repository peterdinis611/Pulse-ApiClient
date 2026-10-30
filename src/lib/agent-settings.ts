import { readStorageItem, writeStorageItem } from "@/lib/app-config";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import {
  AGENT_LLM_SECRET_KEY,
  deleteSecret,
  getSecret,
  setSecret,
} from "@/lib/secrets-ipc";

const KEY = "agent-settings-v1";
const LEGACY_LLM_KEY = "agent-llm-v1";

export const AGENT_SETTINGS_EVENT = "pulse:agent-settings";

export const AGENT_CAPABILITIES = [
  "import_curl",
  "explain_response",
  "explain_tests",
  "draft_tests",
  "draft_pre_request",
  "workspace_status",
  "workspace_history",
  "run_collection",
  "graphql_summarize",
  "sse_parse",
  "memory",
  "memory_rag",
  "openapi",
  "mock",
  "diff",
  "env_show",
  "curl_export",
  "contract_check",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export type AgentLlmProvider = "none" | "openai" | "anthropic";

/** Which high-level agent jobs may use the cloud LLM. */
export type AgentCloudJob = "explain" | "unknown" | "tools";

export type AgentSettings = {
  enabled: boolean;
  capabilities: Record<AgentCapability, boolean>;
  provider: AgentLlmProvider;
  /** In-memory / session value — never written to localStorage when keychain is available. */
  apiKey: string;
  /** When true, never call cloud APIs even if a key is set. */
  offlineOnly: boolean;
  /** Per-job cloud allowlist (ignored when offlineOnly or provider is none). */
  cloudJobs: Record<AgentCloudJob, boolean>;
};

/** @deprecated Prefer AgentSettings — kept for existing imports. */
export type AgentLlmSettings = Pick<AgentSettings, "provider" | "apiKey">;

const ALL_ON = Object.fromEntries(AGENT_CAPABILITIES.map((id) => [id, true])) as Record<
  AgentCapability,
  boolean
>;

const DEFAULT_CLOUD_JOBS: Record<AgentCloudJob, boolean> = {
  explain: true,
  unknown: true,
  tools: true,
};

const DEFAULTS: AgentSettings = {
  enabled: true,
  capabilities: { ...ALL_ON },
  provider: "none",
  apiKey: "",
  offlineOnly: false,
  cloudJobs: { ...DEFAULT_CLOUD_JOBS },
};

/** Session cache for the LLM key (keychain or web fallback). */
let apiKeyCache = "";
let hydrated = false;

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

function normalizeCloudJobs(
  raw: Partial<Record<AgentCloudJob, boolean>> | undefined,
): Record<AgentCloudJob, boolean> {
  const next = { ...DEFAULT_CLOUD_JOBS };
  if (!raw || typeof raw !== "object") return next;
  for (const id of Object.keys(DEFAULT_CLOUD_JOBS) as AgentCloudJob[]) {
    if (typeof raw[id] === "boolean") next[id] = raw[id]!;
  }
  return next;
}

function parseProvider(value: unknown): AgentLlmProvider {
  return value === "openai" || value === "anthropic" ? value : "none";
}

function parseSettings(raw: string | null): AgentSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AgentSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULTS.enabled,
      capabilities: normalizeCapabilities(parsed.capabilities),
      provider: parseProvider(parsed.provider),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      offlineOnly: typeof parsed.offlineOnly === "boolean" ? parsed.offlineOnly : false,
      cloudJobs: normalizeCloudJobs(parsed.cloudJobs),
    };
  } catch {
    return null;
  }
}

function persistMeta(settings: AgentSettings): void {
  const forDisk = {
    enabled: settings.enabled,
    capabilities: settings.capabilities,
    provider: settings.provider,
    // Never persist the real key when desktop keychain is available.
    apiKey: canUseTauriIpc() ? "" : settings.apiKey,
    offlineOnly: settings.offlineOnly,
    cloudJobs: settings.cloudJobs,
  };
  writeStorageItem(KEY, JSON.stringify(forDisk));
}

export function defaultAgentSettings(): AgentSettings {
  return {
    enabled: DEFAULTS.enabled,
    capabilities: { ...ALL_ON },
    provider: DEFAULTS.provider,
    apiKey: DEFAULTS.apiKey,
    offlineOnly: DEFAULTS.offlineOnly,
    cloudJobs: { ...DEFAULT_CLOUD_JOBS },
  };
}

export function loadAgentSettings(): AgentSettings {
  try {
    const rawCurrent = readStorageItem(KEY);
    if (rawCurrent != null) {
      const parsed = parseSettings(rawCurrent) ?? defaultAgentSettings();
      return { ...parsed, apiKey: apiKeyCache || parsed.apiKey };
    }

    const legacyRaw = readStorageItem(LEGACY_LLM_KEY);
    if (legacyRaw != null) {
      const legacy = parseSettings(legacyRaw);
      const migrated: AgentSettings = {
        ...defaultAgentSettings(),
        provider: legacy?.provider ?? "none",
        apiKey: legacy?.apiKey ?? "",
      };
      apiKeyCache = migrated.apiKey;
      persistMeta(migrated);
      return migrated;
    }
    return { ...defaultAgentSettings(), apiKey: apiKeyCache };
  } catch {
    return { ...defaultAgentSettings(), apiKey: apiKeyCache };
  }
}

/** Load LLM API key from OS keychain into the session cache (desktop). */
export async function hydrateAgentApiKey(): Promise<string> {
  if (hydrated && apiKeyCache) return apiKeyCache;
  if (canUseTauriIpc()) {
    try {
      const fromKeychain = await getSecret(AGENT_LLM_SECRET_KEY);
      if (fromKeychain?.trim()) {
        apiKeyCache = fromKeychain;
        hydrated = true;
        return apiKeyCache;
      }
      // Migrate plaintext leftover from older builds into keychain once.
      const disk = parseSettings(readStorageItem(KEY));
      if (disk?.apiKey?.trim()) {
        await setSecret(AGENT_LLM_SECRET_KEY, disk.apiKey.trim());
        apiKeyCache = disk.apiKey.trim();
        persistMeta({ ...disk, apiKey: "" });
        hydrated = true;
        return apiKeyCache;
      }
    } catch {
      // keep cache
    }
  } else {
    const disk = parseSettings(readStorageItem(KEY));
    apiKeyCache = disk?.apiKey ?? "";
  }
  hydrated = true;
  return apiKeyCache;
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
    offlineOnly:
      typeof patch.offlineOnly === "boolean" ? patch.offlineOnly : current.offlineOnly,
    cloudJobs: patch.cloudJobs ? normalizeCloudJobs(patch.cloudJobs) : current.cloudJobs,
  };
  apiKeyCache = next.apiKey;
  persistMeta(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AGENT_SETTINGS_EVENT));
  }
  if (canUseTauriIpc() && typeof patch.apiKey === "string") {
    void (async () => {
      try {
        if (patch.apiKey!.trim()) {
          await setSecret(AGENT_LLM_SECRET_KEY, patch.apiKey!.trim());
        } else {
          await deleteSecret(AGENT_LLM_SECRET_KEY);
        }
      } catch {
        // Settings meta already saved; keychain failure is non-fatal in UI.
      }
    })();
  }
  return next;
}

/** Awaitable save that waits for keychain write on desktop. */
export async function saveAgentSettingsAsync(
  patch: Partial<AgentSettings>,
): Promise<AgentSettings> {
  const next = saveAgentSettings(patch);
  if (canUseTauriIpc() && typeof patch.apiKey === "string") {
    try {
      if (patch.apiKey.trim()) {
        await setSecret(AGENT_LLM_SECRET_KEY, patch.apiKey.trim());
      } else {
        await deleteSecret(AGENT_LLM_SECRET_KEY);
      }
    } catch {
      // ignore
    }
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

export function capabilityForIntent(kind: string): AgentCapability | null {
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
  if (kind === "openapi_import" || kind === "openapi_list") {
    return "openapi";
  }
  if (kind === "response_diff") {
    return "diff";
  }
  if (kind === "mock_start") {
    return "mock";
  }
  if ((AGENT_CAPABILITIES as readonly string[]).includes(kind)) {
    return kind as AgentCapability;
  }
  return null;
}

export function cloudJobForIntent(kind: string): AgentCloudJob | null {
  if (kind === "explain_response" || kind === "explain_tests") return "explain";
  if (kind === "unknown") return "unknown";
  if (kind === "tools" || kind === "tool_call") return "tools";
  return null;
}

/** Whether cloud LLM may run for this job under current settings. */
export function canUseCloudForJob(
  job: AgentCloudJob,
  settings = loadAgentSettings(),
): boolean {
  if (settings.offlineOnly) return false;
  if (!canUseAgentLlm(settings.provider, settings.apiKey)) return false;
  return settings.cloudJobs[job] !== false;
}

export function canUseAgentLlm(provider: AgentLlmProvider, apiKey: string): boolean {
  return provider !== "none" && apiKey.trim().length > 0;
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
