import { useEffect, useState } from "react";
import {
  AGENT_SETTINGS_EVENT,
  loadAgentSettings,
  type AgentSettings,
} from "@/lib/agent-settings";

export function useAgentSettings(): AgentSettings {
  const [settings, setSettings] = useState<AgentSettings>(() => loadAgentSettings());

  useEffect(() => {
    const sync = () => setSettings(loadAgentSettings());
    window.addEventListener(AGENT_SETTINGS_EVENT, sync);
    return () => window.removeEventListener(AGENT_SETTINGS_EVENT, sync);
  }, []);

  return settings;
}
