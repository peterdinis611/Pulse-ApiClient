import type { AgentLlmProvider } from "@/lib/agent-settings";
import { canUseAgentLlm } from "@/lib/agent-settings";

export type AgentLlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type AgentToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AgentLlmResult = {
  text: string;
  toolCalls: AgentToolCall[];
};

const SYSTEM = `You are Pulse, a local API-client assistant. Be concise. Prefer markdown with short bullets. Do not invent HTTP status codes or headers that were not provided. If context is incomplete, say what is missing.

When tools are available you may call them to act in the workspace. Prefer one tool call at a time. Mutating actions (send request, run collection, remember) require the user to confirm in the UI after you propose them.`;

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "send_active_request",
    description: "Propose sending the active request tab (requires user confirm).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_active_collection",
    description: "Propose running the active collection (requires user confirm).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "remember_fact",
    description: "Propose remembering a workspace fact key=value (requires user confirm).",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "string" },
        scope: { type: "string", enum: ["workspace", "local"] },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
];

function openaiTools() {
  return AGENT_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function anthropicTools() {
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

export async function completeAgentLlm(options: {
  provider: Exclude<AgentLlmProvider, "none">;
  apiKey: string;
  messages: AgentLlmMessage[];
  tools?: boolean;
  signal?: AbortSignal;
}): Promise<AgentLlmResult> {
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
        messages: [
          { role: "system", content: SYSTEM },
          ...options.messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.name ? { name: m.name } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          })),
        ],
        ...(options.tools ? { tools: openaiTools() } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const message = json.choices?.[0]?.message;
    const toolCalls: AgentToolCall[] = (message?.tool_calls ?? [])
      .map((call) => ({
        id: call.id,
        name: call.function?.name ?? "",
        arguments: call.function?.arguments ?? "{}",
      }))
      .filter((call) => call.name);
    return { text: message?.content?.trim() ?? "", toolCalls };
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
        .filter((m) => m.role !== "system" && m.role !== "tool")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      ...(options.tools ? { tools: anthropicTools() } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  };
  const text =
    json.content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? "";
  const toolCalls: AgentToolCall[] = (json.content ?? [])
    .filter((part) => part.type === "tool_use" && part.name)
    .map((part) => ({
      id: part.id ?? part.name!,
      name: part.name!,
      arguments: JSON.stringify(part.input ?? {}),
    }));
  return { text, toolCalls };
}

/** Stream assistant text deltas (OpenAI SSE / Anthropic SSE). Tools are not streamed. */
export async function streamAgentLlm(options: {
  provider: Exclude<AgentLlmProvider, "none">;
  apiKey: string;
  messages: AgentLlmMessage[];
  onDelta: (chunk: string) => void;
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
        stream: true,
        messages: [{ role: "system", content: SYSTEM }, ...options.messages],
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    return readOpenAiSse(res.body, options.onDelta, options.signal);
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
      stream: true,
      system: SYSTEM,
      messages: options.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  return readAnthropicSse(res.body, options.onDelta, options.signal);
}

async function readOpenAiSse(
  body: ReadableStream<Uint8Array>,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* ignore partial */
      }
    }
  }
  return full;
}

async function readAnthropicSse(
  body: ReadableStream<Uint8Array>,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      try {
        const json = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (json.type === "content_block_delta" && json.delta?.text) {
          full += json.delta.text;
          onDelta(json.delta.text);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return full;
}

export { canUseAgentLlm };
