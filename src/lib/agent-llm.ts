import type { AgentLlmProvider } from "@/lib/agent-settings";

export type AgentLlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const SYSTEM = `You are Pulse, a local API-client assistant. Be concise. Prefer markdown with short bullets. Do not invent HTTP status codes or headers that were not provided. If context is incomplete, say what is missing.`;

export async function completeAgentLlm(options: {
  provider: Exclude<AgentLlmProvider, "none">;
  apiKey: string;
  messages: AgentLlmMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const key = options.apiKey.trim();
  if (!key) throw new Error("Missing API key");

  if (options.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [{ role: "system", content: SYSTEM }, ...options.messages],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty OpenAI response");
    return text;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: options.signal,
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1024,
      system: SYSTEM,
      messages: options.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = json.content?.find((part) => part.type === "text")?.text?.trim();
  if (!text) throw new Error("Empty Anthropic response");
  return text;
}

export function canUseAgentLlm(provider: AgentLlmProvider, apiKey: string): boolean {
  return provider !== "none" && apiKey.trim().length > 0;
}
