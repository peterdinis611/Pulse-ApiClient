import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITIES,
  defaultAgentSettings,
  isAgentCapabilityEnabled,
  isAgentEnabled,
  loadAgentSettings,
  saveAgentSettings,
} from "@/lib/agent-settings";

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

function installWindow() {
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
  });
}

describe("agent-settings", () => {
  beforeEach(() => {
    installLocalStorage();
    installWindow();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to enabled with every capability on", () => {
    const settings = loadAgentSettings();
    expect(settings).toEqual(defaultAgentSettings());
    expect(isAgentEnabled(settings)).toBe(true);
    for (const id of AGENT_CAPABILITIES) {
      expect(isAgentCapabilityEnabled(id, settings)).toBe(true);
    }
  });

  it("persists enable and capability toggles", () => {
    saveAgentSettings({
      enabled: false,
      capabilities: {
        ...defaultAgentSettings().capabilities,
        run_collection: false,
      },
    });
    const loaded = loadAgentSettings();
    expect(loaded.enabled).toBe(false);
    expect(loaded.capabilities.run_collection).toBe(false);
    expect(isAgentCapabilityEnabled("import_curl", loaded)).toBe(false);
  });

  it("migrates legacy LLM settings", () => {
    localStorage.removeItem("pulse-api-client/agent-settings-v1");
    localStorage.setItem(
      "pulse-api-client/agent-llm-v1",
      JSON.stringify({ provider: "openai", apiKey: "sk-test" }),
    );
    expect(localStorage.getItem("pulse-api-client/agent-settings-v1")).toBeNull();
    const loaded = loadAgentSettings();
    expect(loaded.provider).toBe("openai");
    expect(loaded.apiKey).toBe("sk-test");
    expect(loaded.enabled).toBe(true);
    expect(localStorage.getItem("pulse-api-client/agent-settings-v1")).toBeTruthy();
  });
});
