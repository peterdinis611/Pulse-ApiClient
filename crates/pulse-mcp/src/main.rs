use std::io::{self, BufRead, Write};

use pulse_core::secrets::{parse_dotenv, redact_json};
use pulse_core::simple_http::send_once;
use pulse_core::types::HttpRequestPayload;
use pulse_core::types::SavedRequestDto;
use pulse_core::workspace_fs::{
    append_agent_history, is_mutating_method, load_workspace, save_request, write_pending,
};
use pulse_core::substitute_variables;
use serde_json::{json, Value};

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn workspace_root() -> Result<String, String> {
    std::env::var("PULSE_WORKSPACE").map_err(|_| "PULSE_WORKSPACE is not set".into())
}

fn text(body: impl Into<String>, error: bool) -> Value {
    let mut payload = json!({ "content": [{ "type": "text", "text": body.into() }] });
    if error {
        payload["isError"] = json!(true);
    }
    payload
}

fn load_secrets(root: &str) -> Vec<pulse_core::types::EnvVariable> {
    let path = std::path::Path::new(root).join(".env");
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    pulse_core::secrets::dotenv_to_variables(&parse_dotenv(&raw))
}

fn tools() -> Value {
    json!([
        {
            "name": "pulse_workspace_list",
            "description": "List collections and requests in PULSE_WORKSPACE",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "pulse_workspace_read",
            "description": "Read a saved request from the Git workspace",
            "inputSchema": { "type": "object", "required": ["id"], "properties": { "id": { "type": "string" } } }
        },
        {
            "name": "pulse_workspace_write",
            "description": "Write a saved request YAML into the Git workspace",
            "inputSchema": {
                "type": "object",
                "required": ["saved", "groupName"],
                "properties": { "saved": { "type": "object" }, "groupName": { "type": "string" } }
            }
        },
        {
            "name": "pulse_send",
            "description": "Send one HTTP request. Mutating methods need confirm=true.",
            "inputSchema": {
                "type": "object",
                "required": ["url"],
                "properties": {
                    "method": { "type": "string" },
                    "url": { "type": "string" },
                    "confirm": { "type": "boolean" }
                }
            }
        },
        {
            "name": "pulse_help",
            "description": "List Pulse MCP tools",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ])
}

async fn dispatch_tool(name: &str, arguments: &Value) -> Value {
    match name {
        "pulse_help" => text(serde_json::to_string_pretty(&tools()).unwrap_or_default(), false),
        "pulse_workspace_list" => match workspace_root().and_then(|root| load_workspace(&root)) {
            Ok(payload) => text(serde_json::to_string_pretty(&payload).unwrap_or_default(), false),
            Err(error) => text(error, true),
        },
        "pulse_workspace_read" => {
            let id = arguments.get("id").and_then(|v| v.as_str()).unwrap_or("");
            match workspace_root().and_then(|root| load_workspace(&root)) {
                Ok(payload) => match payload.collections.iter().find(|item| item.id == id) {
                    Some(item) => text(serde_json::to_string_pretty(item).unwrap_or_default(), false),
                    None => text("Request not found", true),
                },
                Err(error) => text(error, true),
            }
        }
        "pulse_workspace_write" => {
            let root = match workspace_root() {
                Ok(root) => root,
                Err(error) => return text(error, true),
            };
            let group = arguments
                .get("groupName")
                .and_then(|v| v.as_str())
                .unwrap_or("collection");
            match serde_json::from_value::<SavedRequestDto>(
                arguments.get("saved").cloned().unwrap_or(Value::Null),
            ) {
                Ok(saved) => match save_request(&root, &saved, group) {
                    Ok(path) => text(path, false),
                    Err(error) => text(error, true),
                },
                Err(error) => text(error.to_string(), true),
            }
        }
        "pulse_send" => {
            let method = arguments.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
            let url = arguments.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if url.is_empty() {
                return text("url is required", true);
            }
            if is_mutating_method(method) && arguments.get("confirm") != Some(&Value::Bool(true)) {
                if let Ok(root) = workspace_root() {
                    let pending = json!({
                        "method": method,
                        "url": url,
                        "source": "agent",
                    });
                    let _ = write_pending(&root, "mutation", &pending);
                }
                return text(
                    "Mutating method requires confirm=true. Wrote .pulse/pending for desktop approval.",
                    true,
                );
            }
            let mut payload = HttpRequestPayload {
                method: method.into(),
                url: url.into(),
                headers: vec![],
                query: vec![],
                body_kind: "none".into(),
                body: String::new(),
                form: vec![],
                multipart: vec![],
                auth: Default::default(),
                use_cache: None,
                request_id: None,
                timeout_ms: None,
            };
            if let Ok(root) = workspace_root() {
                let vars = load_secrets(&root);
                payload.url = substitute_variables(&payload.url, &vars);
            }
            match send_once(payload).await {
                Ok(response) => {
                    let mut value = serde_json::to_value(&response).unwrap_or(Value::Null);
                    if let Ok(root) = workspace_root() {
                        let secrets = load_secrets(&root);
                        redact_json(&mut value, &secrets);
                        let mut request_json = json!({ "method": method, "url": url });
                        redact_json(&mut request_json, &secrets);
                        let _ = append_agent_history(
                            &root,
                            &json!({
                                "id": format!("hist_agent_{}", chrono_like_id()),
                                "sentAt": now_rfc3339(),
                                "source": "agent",
                                "request": request_json,
                                "response": {
                                    "status": response.status,
                                    "elapsedMs": response.elapsed_ms,
                                    "sizeBytes": response.size_bytes
                                }
                            }),
                        );
                    }
                    text(value.to_string(), false)
                }
                Err(error) => text(error, true),
            }
        }
        _ => json!({
            "content": [{ "type": "text", "text": format!("Unknown tool: {name}") }],
            "isError": true
        }),
    }
}

fn chrono_like_id() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn now_rfc3339() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

fn handle(message: &Value) -> Option<Value> {
    let method = message.get("method")?.as_str()?;
    let id = message.get("id").cloned();
    if method == "notifications/initialized" || method == "notifications/cancelled" {
        return None;
    }
    if method == "initialize" {
        return Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "pulse", "version": VERSION }
            }
        }));
    }
    if method == "tools/list" {
        return Some(json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools() } }));
    }
    None
}

#[tokio::main]
async fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if message.get("method").and_then(|v| v.as_str()) == Some("tools/call") {
            let id = message.get("id").cloned();
            let name = message
                .pointer("/params/name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let arguments = message.pointer("/params/arguments").cloned().unwrap_or(json!({}));
            let result = dispatch_tool(name, &arguments).await;
            let _ = writeln!(stdout, "{}", json!({ "jsonrpc": "2.0", "id": id, "result": result }));
            let _ = stdout.flush();
            continue;
        }
        if let Some(outgoing) = handle(&message) {
            let _ = writeln!(stdout, "{outgoing}");
            let _ = stdout.flush();
        }
    }
}
