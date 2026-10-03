import { readStorageItem, writeStorageItem } from "@/lib/app-config";

const KEY = "agent-llm-v1";

export type AgentLlmSettings = {
  provider: "none" | "openai" | "anthropic";
  apiKey: string;
};

const DEFAULTS: AgentLlmSettings = {
  provider: "none",
  apiKey: "",
};

export function loadAgentLlmSettings(): AgentLlmSettings {
  try {
    const raw = readStorageItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AgentLlmSettings>;
    return {
      provider: parsed.provider === "openai" || parsed.provider === "anthropic" ? parsed.provider : "none",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAgentLlmSettings(settings: AgentLlmSettings): void {
  writeStorageItem(KEY, JSON.stringify(settings));
}
