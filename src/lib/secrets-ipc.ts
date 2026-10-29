import { invokeEffect } from "@/lib/effect/tauri";
import { runEffect } from "@/lib/effect/run";
import { canUseTauriIpc } from "@/lib/tauri-runtime";

export async function setSecret(key: string, value: string): Promise<void> {
  if (!canUseTauriIpc()) {
    // Browser / web preview: keep in session only via caller.
    return;
  }
  await runEffect(invokeEffect<void>("secret_set", { key, value }));
}

export async function getSecret(key: string): Promise<string | null> {
  if (!canUseTauriIpc()) return null;
  return runEffect(invokeEffect<string | null>("secret_get", { key }));
}

export async function deleteSecret(key: string): Promise<void> {
  if (!canUseTauriIpc()) return;
  await runEffect(invokeEffect<void>("secret_delete", { key }));
}

export const AGENT_LLM_SECRET_KEY = "agent.llm.apiKey";
