//! Local intent router for CLI / MCP / native (no LLM).
//! Mirrors `src/lib/agent-router.ts` for offline-safe intents.

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::OnceLock;

use crate::agent_memory::{
    delete_fact, format_facts_markdown, get_fact, list_facts, parse_remember_pair, search_facts,
    upsert_fact, MemoryScope, UpsertFactInput,
};
use crate::curl::curl_to_payload;
use crate::graphql::summarize_schema;
use crate::sse::parse_sse_text;
use crate::workspace_fs::{
    append_agent_history, list_pending, load_workspace, read_agent_history,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AgentIntent {
    Help,
    ImportCurl { curl: String },
    ExplainResponse,
    ExplainTests,
    WorkspaceStatus,
    WorkspaceHistory,
    RunCollection,
    GraphqlSummarize,
    SseParse { text: String },
    Remember {
        key: String,
        value: String,
        scope: String,
    },
    Recall { query: String },
    Forget { key: String },
    MemoryList,
    Unknown { input: String },
}

#[derive(Debug, Clone)]
pub struct AgentExecuteOptions<'a> {
    pub workspace_root: Option<&'a str>,
    pub graphql_body: Option<&'a str>,
    pub history_limit: usize,
    pub source: &'a str,
    pub record_history: bool,
}

impl Default for AgentExecuteOptions<'_> {
    fn default() -> Self {
        Self {
            workspace_root: None,
            graphql_body: None,
            history_limit: 15,
            source: "cli-agent",
            record_history: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResult {
    pub kind: String,
    pub markdown: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

pub const AGENT_HELP_TEXT: &str = "I understand these intents (local, no LLM):

• **Import cURL** — paste a curl command → JSON request payload
• **Workspace status** — Git workspace root + pending mutations
• **Agent history** — recent entries from `.pulse/history.jsonl`
• **Memory** — `remember key=value`, `recall key`, `forget key`, `list memory`
• **GraphQL summarize** — pass introspection/response body via `--body` / `body`
• **Parse SSE** — paste an SSE document (event/data blocks)

Desktop-only (use the in-app Agent view):
• Explain last response / test failures
• Run active collection (needs confirm)

Examples: `pulse agent \"workspace status\"` · `pulse agent 'remember env=staging'`";

fn kind_name(intent: &AgentIntent) -> String {
    match intent {
        AgentIntent::Help => "help".into(),
        AgentIntent::ImportCurl { .. } => "import_curl".into(),
        AgentIntent::ExplainResponse => "explain_response".into(),
        AgentIntent::ExplainTests => "explain_tests".into(),
        AgentIntent::WorkspaceStatus => "workspace_status".into(),
        AgentIntent::WorkspaceHistory => "workspace_history".into(),
        AgentIntent::RunCollection => "run_collection".into(),
        AgentIntent::GraphqlSummarize => "graphql_summarize".into(),
        AgentIntent::SseParse { .. } => "sse_parse".into(),
        AgentIntent::Remember { .. } => "remember".into(),
        AgentIntent::Recall { .. } => "recall".into(),
        AgentIntent::Forget { .. } => "forget".into(),
        AgentIntent::MemoryList => "memory_list".into(),
        AgentIntent::Unknown { .. } => "unknown".into(),
    }
}

fn curl_block_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?is)```(?:bash|sh|shell|zsh)?\s*([\s\S]*?curl[\s\S]*?)```").unwrap())
}

fn curl_line_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?is)((?:^|\n)\s*curl\b[\s\S]+)").unwrap())
}

fn sse_fence_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?is)```(?:sse|text)?\s*([\s\S]*?)```").unwrap())
}

fn sse_field_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?im)(?:^|\n)\s*(?:data|event|id|retry):").unwrap())
}

fn sse_field_line_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?im)\n\s*(?:data|event|id|retry):").unwrap())
}

fn explain_response_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"explain\s+(last\s+)?response").unwrap())
}

fn explain_tests_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"explain\s+(test|tests|failures)").unwrap())
}

fn test_failures_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"test\s+failures").unwrap())
}

fn workspace_status_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"workspace\s+status").unwrap())
}

fn pending_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"pending\s+mutations?").unwrap())
}

fn agent_history_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"agent\s+history").unwrap())
}

fn workspace_history_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"workspace\s+history").unwrap())
}

fn run_collection_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^run\s+(active\s+)?collection").unwrap())
}

fn graphql_summarize_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"graphql\s+(summarize|schema|introspect)").unwrap())
}

fn import_curl_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"import\s+curl").unwrap())
}

fn parse_sse_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"parse\s+sse").unwrap())
}

fn remember_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^remember\s+(.+)$").unwrap())
}

fn recall_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(?:recall|what\s+do\s+you\s+remember\s+about)\s+(.+)$").unwrap())
}

fn forget_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^forget\s+(.+)$").unwrap())
}

fn require_workspace<'a>(opts: &'a AgentExecuteOptions<'_>) -> Result<&'a str, String> {
    opts.workspace_root
        .filter(|item| !item.is_empty())
        .ok_or_else(|| "No workspace root. Set PULSE_WORKSPACE or pass workspace.".to_string())
}

fn known_facts_block(root: &str) -> String {
    let facts = list_facts(root, None).unwrap_or_default();
    if facts.is_empty() {
        return String::new();
    }
    let top: Vec<_> = facts.into_iter().take(8).collect();
    format!("\n\n---\n{}", format_facts_markdown(&top, "Known facts"))
}

fn extract_curl(input: &str) -> Option<String> {
    if let Some(caps) = curl_block_re().captures(input) {
        let block = caps.get(1)?.as_str().trim();
        if block.to_ascii_lowercase().contains("curl") {
            return Some(block.to_string());
        }
    }
    if let Some(caps) = curl_line_re().captures(input) {
        return Some(caps.get(1)?.as_str().trim().to_string());
    }
    let trimmed = input.trim();
    if trimmed.to_ascii_lowercase().starts_with("curl ") {
        return Some(trimmed.to_string());
    }
    None
}

fn extract_sse_doc(input: &str) -> Option<String> {
    if let Some(caps) = sse_fence_re().captures(input) {
        let block = caps.get(1)?.as_str().trim();
        if sse_field_re().is_match(block) {
            return Some(block.to_string());
        }
    }
    if sse_field_re().is_match(input)
        && (input.contains("\n\n") || sse_field_line_re().is_match(input))
    {
        return Some(input.trim().to_string());
    }
    None
}

/// Map a user utterance (or quick-action id) to a structured intent.
pub fn route_agent_input(raw: &str) -> AgentIntent {
    let input = raw.trim();
    if input.is_empty() {
        return AgentIntent::Help;
    }

    let quick = input.to_ascii_lowercase();
    if quick == "help" || quick == "?" || quick == "quick:help" {
        return AgentIntent::Help;
    }
    if quick == "quick:explain" || quick == "explain response" || explain_response_re().is_match(&quick)
    {
        return AgentIntent::ExplainResponse;
    }
    if quick == "quick:tests"
        || explain_tests_re().is_match(&quick)
        || test_failures_re().is_match(&quick)
    {
        return AgentIntent::ExplainTests;
    }
    if quick == "quick:workspace"
        || workspace_status_re().is_match(&quick)
        || pending_re().is_match(&quick)
        || quick == "status"
    {
        return AgentIntent::WorkspaceStatus;
    }
    if quick == "quick:history"
        || agent_history_re().is_match(&quick)
        || workspace_history_re().is_match(&quick)
    {
        return AgentIntent::WorkspaceHistory;
    }
    if quick == "quick:run" || run_collection_re().is_match(&quick) {
        return AgentIntent::RunCollection;
    }
    if graphql_summarize_re().is_match(&quick) || quick == "summarize schema" {
        return AgentIntent::GraphqlSummarize;
    }
    if quick == "quick:memory"
        || quick == "list memory"
        || quick == "memory list"
        || quick == "show memory"
    {
        return AgentIntent::MemoryList;
    }
    if remember_re().is_match(&quick) {
        let rest = input
            .strip_prefix("remember")
            .or_else(|| input.strip_prefix("Remember"))
            .unwrap_or("")
            .trim();
        let mut scope = "workspace".to_string();
        let body = rest
            .split_whitespace()
            .filter(|part| {
                let p = part.to_ascii_lowercase();
                if p == "--local" || p == "--scope=local" || p == "scope=local" {
                    scope = "local".into();
                    false
                } else {
                    true
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        if let Some((key, value)) = parse_remember_pair(&body) {
            return AgentIntent::Remember { key, value, scope };
        }
        return AgentIntent::Unknown {
            input: "Usage: remember key=value  (optional --local)".into(),
        };
    }
    if let Some(caps) = recall_re().captures(&quick) {
        let query = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("").to_string();
        return AgentIntent::Recall { query };
    }
    if let Some(caps) = forget_re().captures(&quick) {
        let key = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("").to_string();
        return AgentIntent::Forget { key };
    }

    if let Some(curl) = extract_curl(input) {
        return AgentIntent::ImportCurl { curl };
    }
    if quick == "quick:curl" || import_curl_re().is_match(&quick) {
        return AgentIntent::Unknown {
            input: "Paste a cURL command (or wrap it in a ```bash fence).".into(),
        };
    }

    if let Some(sse) = extract_sse_doc(input) {
        return AgentIntent::SseParse { text: sse };
    }
    if parse_sse_re().is_match(&quick) {
        return AgentIntent::Unknown {
            input: "Paste an SSE document to parse (event/data blocks).".into(),
        };
    }

    AgentIntent::Unknown {
        input: input.to_string(),
    }
}

fn record_history(opts: &AgentExecuteOptions<'_>, kind: &str, meta: Value) {
    if !opts.record_history {
        return;
    }
    let Some(root) = opts.workspace_root.filter(|item| !item.is_empty()) else {
        return;
    };
    let mut entry = json!({
        "id": format!("hist_agent_{}", chrono_like_id()),
        "sentAt": iso_now(),
        "source": opts.source,
        "kind": kind,
    });
    if let Some(obj) = entry.as_object_mut() {
        if let Some(map) = meta.as_object() {
            for (key, value) in map {
                obj.insert(key.clone(), value.clone());
            }
        }
    }
    let _ = append_agent_history(root, &entry);
}

fn chrono_like_id() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn iso_now() -> String {
    // Keep deps light: RFC3339-ish UTC millis without chrono crate.
    let millis = chrono_like_id();
    let secs = millis / 1000;
    let ms = millis % 1000;
    format!("{secs}.{ms:03}Z")
}

fn summarize_schema_markdown(body: &str) -> Option<String> {
    let summary = summarize_schema(body)?;
    let mut lines = vec![
        "**GraphQL schema summary**".into(),
        format!("- queryType: {}", summary.query_type.as_deref().unwrap_or("—")),
        format!(
            "- mutationType: {}",
            summary.mutation_type.as_deref().unwrap_or("—")
        ),
        format!(
            "- subscriptionType: {}",
            summary.subscription_type.as_deref().unwrap_or("—")
        ),
        format!("- object types with fields: {}", summary.types.len()),
        String::new(),
    ];
    for item in summary.types.iter().take(40) {
        let fields: Vec<&str> = item.fields.iter().take(12).map(String::as_str).collect();
        let more = if item.fields.len() > 12 { "…" } else { "" };
        lines.push(format!(
            "- **{}** ({}): {}{}",
            item.name,
            item.kind.as_deref().unwrap_or("OBJECT"),
            fields.join(", "),
            more
        ));
    }
    if summary.types.len() > 40 {
        lines.push(format!("…+{} more types", summary.types.len() - 40));
    }
    Some(lines.join("\n"))
}

/// Execute a routed intent with offline-safe backends.
pub fn execute_agent_intent(
    intent: &AgentIntent,
    opts: &AgentExecuteOptions<'_>,
) -> Result<AgentResult, String> {
    let kind = kind_name(intent);
    match intent {
        AgentIntent::Help => Ok(AgentResult {
            kind,
            markdown: AGENT_HELP_TEXT.into(),
            data: None,
        }),
        AgentIntent::Unknown { input } => Ok(AgentResult {
            kind,
            markdown: format!("{input}\n\n---\n{AGENT_HELP_TEXT}"),
            data: None,
        }),
        AgentIntent::ExplainResponse | AgentIntent::ExplainTests | AgentIntent::RunCollection => {
            Ok(AgentResult {
                kind,
                markdown: "This intent needs the desktop in-app Agent (active tab / confirm UI). \
CLI and MCP support offline intents: cURL import, SSE parse, workspace status/history, GraphQL summarize."
                    .into(),
                data: Some(json!({ "desktopOnly": true })),
            })
        }
        AgentIntent::ImportCurl { curl } => {
            let payload = curl_to_payload(curl)?;
            record_history(
                opts,
                "import_curl",
                json!({ "request": { "method": payload.method, "url": payload.url } }),
            );
            Ok(AgentResult {
                kind,
                markdown: format!(
                    "Parsed **{}** `{}`.",
                    payload.method, payload.url
                ),
                data: Some(serde_json::to_value(&payload).map_err(|e| e.to_string())?),
            })
        }
        AgentIntent::WorkspaceStatus => {
            let root = opts
                .workspace_root
                .filter(|item| !item.is_empty())
                .ok_or_else(|| {
                    "No workspace root. Set PULSE_WORKSPACE or pass workspace.".to_string()
                })?;
            let payload = load_workspace(root)?;
            let pending = list_pending(root).unwrap_or_default();
            let history = read_agent_history(root).unwrap_or_default();
            let secret_keys: Vec<String> = payload
                .secrets
                .iter()
                .map(|item| {
                    item.key
                        .strip_prefix("secret.")
                        .unwrap_or(&item.key)
                        .to_string()
                })
                .collect();
            let status = json!({
                "root": payload.root,
                "name": payload.name,
                "requests": payload.collections.len(),
                "environments": payload.environments.iter().map(|item| item.name.clone()).collect::<Vec<_>>(),
                "pending": pending.len(),
                "history": history.len(),
                "secretKeys": secret_keys,
            });
            record_history(
                opts,
                "workspace_status",
                json!({ "pendingCount": pending.len(), "historyCount": history.len() }),
            );
            let mut lines = vec![
                format!("**Workspace:** `{}`", payload.root),
                format!("**Name:** {}", payload.name),
                format!("**Requests:** {}", payload.collections.len()),
                format!("**Pending mutations:** {}", pending.len()),
            ];
            for item in pending.iter().take(12) {
                lines.push(format!("- `{item}`"));
            }
            if pending.len() > 12 {
                lines.push(format!("…+{} more", pending.len() - 12));
            }
            lines.push(format!("**Agent history entries:** {}", history.len()));
            let memory_count = list_facts(root, None).map(|f| f.len()).unwrap_or(0);
            lines.push(format!("**Memory facts:** {memory_count}"));
            let mut markdown = lines.join("\n");
            markdown.push_str(&known_facts_block(root));
            Ok(AgentResult {
                kind,
                markdown,
                data: Some(status),
            })
        }
        AgentIntent::WorkspaceHistory => {
            let root = opts
                .workspace_root
                .filter(|item| !item.is_empty())
                .ok_or_else(|| {
                    "No workspace root. Set PULSE_WORKSPACE or pass workspace.".to_string()
                })?;
            let history = read_agent_history(root)?;
            let limit = opts.history_limit.max(1);
            let recent: Vec<&Value> = history.iter().rev().take(limit).collect();
            if recent.is_empty() {
                return Ok(AgentResult {
                    kind,
                    markdown: "Agent history is empty.".into(),
                    data: Some(json!({ "count": 0, "entries": [] })),
                });
            }
            let mut lines = vec!["**Recent agent history** (newest first):".into(), String::new()];
            for entry in &recent {
                let source = entry
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("agent");
                let sent_at = entry
                    .get("sentAt")
                    .and_then(|v| v.as_str())
                    .or_else(|| entry.get("id").and_then(|v| v.as_str()))
                    .unwrap_or("");
                let method = entry
                    .pointer("/request/method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let url = entry
                    .pointer("/request/url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let status = entry
                    .pointer("/response/status")
                    .and_then(|v| v.as_u64())
                    .map(|n| format!(" → {n}"))
                    .unwrap_or_default();
                let method_bit = if method.is_empty() {
                    String::new()
                } else {
                    format!(" · {method}")
                };
                let url_bit = if url.is_empty() {
                    String::new()
                } else {
                    format!(" {url}")
                };
                lines.push(format!("- `{source}` {sent_at}{method_bit}{url_bit}{status}"));
            }
            Ok(AgentResult {
                kind,
                markdown: lines.join("\n"),
                data: Some(json!({ "count": history.len(), "entries": recent })),
            })
        }
        AgentIntent::GraphqlSummarize => {
            let body = opts
                .graphql_body
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .ok_or_else(|| {
                    "No GraphQL body. Pass --body / body with an introspection or response JSON."
                        .to_string()
                })?;
            let markdown = summarize_schema_markdown(body).ok_or_else(|| {
                "Body is not a GraphQL introspection payload.".to_string()
            })?;
            let summary = summarize_schema(body);
            record_history(opts, "graphql_summarize", json!({}));
            Ok(AgentResult {
                kind,
                markdown,
                data: summary.and_then(|item| serde_json::to_value(item).ok()),
            })
        }
        AgentIntent::SseParse { text } => {
            let events = parse_sse_text(text)?;
            if events.is_empty() {
                return Ok(AgentResult {
                    kind,
                    markdown: "No SSE events found in the pasted document.".into(),
                    data: Some(json!({ "events": [] })),
                });
            }
            record_history(opts, "sse_parse", json!({ "count": events.len() }));
            let mut lines = vec![format!("**Parsed {} SSE event(s):**", events.len()), String::new()];
            for (index, event) in events.iter().take(30).enumerate() {
                let mut bits = Vec::new();
                if let Some(name) = &event.event {
                    bits.push(format!("event={name}"));
                }
                if let Some(id) = &event.id {
                    bits.push(format!("id={id}"));
                }
                if let Some(retry) = event.retry_ms {
                    bits.push(format!("retry={retry}"));
                }
                let label = if bits.is_empty() {
                    "message".into()
                } else {
                    bits.join(" · ")
                };
                lines.push(format!("{}. {label}", index + 1));
                lines.push("```".into());
                lines.push(if event.data.is_empty() {
                    "(empty data)".into()
                } else {
                    event.data.clone()
                });
                lines.push("```".into());
            }
            if events.len() > 30 {
                lines.push(format!("…+{} more", events.len() - 30));
            }
            Ok(AgentResult {
                kind,
                markdown: lines.join("\n"),
                data: Some(serde_json::to_value(&events).map_err(|e| e.to_string())?),
            })
        }
        AgentIntent::Remember { key, value, scope } => {
            let root = require_workspace(opts)?;
            let scope = MemoryScope::parse(scope).unwrap_or(MemoryScope::Workspace);
            let fact = upsert_fact(
                root,
                UpsertFactInput {
                    key,
                    value,
                    scope,
                    source: opts.source,
                    tags: Vec::new(),
                    note: None,
                },
            )?;
            record_history(
                opts,
                "remember",
                json!({ "key": fact.key, "scope": fact.scope.as_str() }),
            );
            Ok(AgentResult {
                kind,
                markdown: format!(
                    "Remembered `{}` = {} (`{}`).",
                    fact.key,
                    fact.value,
                    fact.scope.as_str()
                ),
                data: Some(serde_json::to_value(&fact).map_err(|e| e.to_string())?),
            })
        }
        AgentIntent::Recall { query } => {
            let root = require_workspace(opts)?;
            let q = query.trim();
            if q.is_empty() {
                return Ok(AgentResult {
                    kind,
                    markdown: "Usage: recall <key or search>".into(),
                    data: None,
                });
            }
            if let Some(exact) = get_fact(root, q, None)? {
                record_history(opts, "recall", json!({ "key": exact.key }));
                return Ok(AgentResult {
                    kind,
                    markdown: format!(
                        "**{}** = {} `[{}]`{}",
                        exact.key,
                        exact.value,
                        exact.scope.as_str(),
                        exact
                            .note
                            .as_deref()
                            .map(|n| format!("\n_{n}_"))
                            .unwrap_or_default()
                    ),
                    data: Some(serde_json::to_value(&exact).map_err(|e| e.to_string())?),
                });
            }
            let found = search_facts(root, q)?;
            record_history(opts, "recall", json!({ "query": q, "count": found.len() }));
            Ok(AgentResult {
                kind,
                markdown: format_facts_markdown(&found, &format!("Recall “{q}”")),
                data: Some(json!({ "count": found.len(), "facts": found })),
            })
        }
        AgentIntent::Forget { key } => {
            let root = require_workspace(opts)?;
            let removed = delete_fact(root, key, None)?;
            record_history(opts, "forget", json!({ "key": key, "removed": removed }));
            Ok(AgentResult {
                kind,
                markdown: if removed {
                    format!("Forgot `{key}`.")
                } else {
                    format!("No memory found for `{key}`.")
                },
                data: Some(json!({ "key": key, "removed": removed })),
            })
        }
        AgentIntent::MemoryList => {
            let root = require_workspace(opts)?;
            let facts = list_facts(root, None)?;
            record_history(opts, "memory_list", json!({ "count": facts.len() }));
            Ok(AgentResult {
                kind,
                markdown: format_facts_markdown(&facts, "Agent memory"),
                data: Some(json!({ "count": facts.len(), "facts": facts })),
            })
        }
    }
}

pub fn run_agent(raw: &str, opts: &AgentExecuteOptions<'_>) -> Result<AgentResult, String> {
    execute_agent_intent(&route_agent_input(raw), opts)
}

#[cfg(test)]
#[path = "__tests__/agent_tests.rs"]
mod tests;
