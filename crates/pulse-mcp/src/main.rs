use std::io::{self, BufRead, Write};
use std::sync::Mutex;

mod catalog;

use pulse_core::breaking_diff;
use pulse_core::check_workspace;
use pulse_core::compare_to_schema;
use pulse_core::build_graphql_body_raw;
use pulse_core::AgentExecuteOptions;
use pulse_core::run_agent;
use pulse_core::curl_to_payload;
use pulse_core::diff_compare;
use pulse_core::format_graphql_response;
use pulse_core::list_graphql_operations;
use pulse_core::summarize_graphql_schema;
use pulse_core::INTROSPECTION_QUERY;
use pulse_core::graphql_ws::{
    complete as gql_complete, connection_init, connection_init_payload_from_auth, parse_message,
    ping as gql_ping, pong as gql_pong, start as gql_start, stop as gql_stop,
    subscribe as gql_subscribe, GRAPHQL_WS_PROTOCOLS,
};
use pulse_core::init_workspace;
use pulse_core::interpolate_request;
use pulse_core::migrate_pulse_json_dumps;
use pulse_core::openapi_ops::list_operations;
use pulse_core::collect_sse;
use pulse_core::parse_sse_text;
use pulse_core::SseCollectOptions;
use pulse_core::routes_from_saved_requests;
use pulse_core::run_collection;
use pulse_core::run_http_tests;
use pulse_core::run_pre_request_script_with_env;
use pulse_core::secrets::redact_json;
use pulse_core::simple_http::send_once;
use pulse_core::start_mock_server_with_delay;
use pulse_core::substitute_variables;
use pulse_core::to_http_payload;
use pulse_core::types::{
    AuthConfig, EnvVariable, HttpRequestPayload, HttpResponsePayload, KeyValue, ResponseHeader,
    SavedRequestDto,
};
use pulse_core::workspace_fs::{
    append_agent_history, delete_request, is_mutating_method, list_pending, load_workspace, read_agent_history,
    save_request, write_pending,
};
use pulse_core::{CollectionRunInput, MockRoute, MockServer};
use serde_json::{json, Map, Value};

use catalog::STREAM_AND_CONTRACT_TOOLS;

const VERSION: &str = env!("CARGO_PKG_VERSION");

static MOCK_STATE: Mutex<Option<MockServer>> = Mutex::new(None);

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

fn json_text(value: &Value, error: bool) -> Value {
    text(serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".into()), error)
}

fn arg_str(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn confirmed(args: &Value) -> bool {
    args.get("confirm") == Some(&Value::Bool(true))
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn kv_list(value: Option<&Value>) -> Vec<KeyValue> {
    match value {
        Some(Value::Object(map)) => map
            .iter()
            .map(|(key, item)| KeyValue {
                key: key.clone(),
                value: value_to_string(item),
                enabled: true,
            })
            .collect(),
        Some(Value::Array(_)) => serde_json::from_value(value.cloned().unwrap_or(Value::Null)).unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn extra_vars(args: &Value) -> Vec<EnvVariable> {
    let Some(env) = args.get("env").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    env.iter()
        .map(|(key, value)| EnvVariable {
            id: key.clone(),
            key: key.clone(),
            value: value_to_string(value),
            enabled: true,
            secret: key.starts_with("secret."),
        })
        .collect()
}

fn find_saved<'a>(payload: &'a pulse_core::GitWorkspacePayload, needle: &str) -> Option<&'a SavedRequestDto> {
    payload.collections.iter().find(|item| {
        item.id == needle || item.name == needle || item.file_path.as_deref() == Some(needle)
    })
}

fn merged_vars(
    payload: &pulse_core::GitWorkspacePayload,
    saved: &SavedRequestDto,
    args: &Value,
) -> Vec<EnvVariable> {
    let mut vars = Vec::new();
    if let Some(group) = payload
        .collection_groups
        .iter()
        .find(|group| group.id == saved.collection_id)
    {
        vars.extend(group.variables.iter().filter(|item| item.enabled).cloned());
    }
    let env_name = arg_str(args, "envName");
    if !env_name.is_empty() {
        if let Some(env) = payload
            .environments
            .iter()
            .find(|item| item.name == env_name || item.id == env_name)
        {
            vars.extend(env.variables.iter().filter(|item| item.enabled).cloned());
        }
    }
    vars.extend(payload.secrets.clone());
    vars.extend(extra_vars(args));
    vars
}

fn http_from_args(args: &Value) -> HttpRequestPayload {
    let method = arg_str(args, "method");
    let method = if method.is_empty() { "GET".into() } else { method };
    let mut auth = AuthConfig {
        auth_type: arg_str(args, "authType"),
        bearer_token: args.get("bearerToken").and_then(|v| v.as_str()).map(str::to_string),
        basic_username: args.get("basicUsername").and_then(|v| v.as_str()).map(str::to_string),
        basic_password: args.get("basicPassword").and_then(|v| v.as_str()).map(str::to_string),
        api_key_key: args.get("apiKeyKey").and_then(|v| v.as_str()).map(str::to_string),
        api_key_value: args.get("apiKeyValue").and_then(|v| v.as_str()).map(str::to_string),
        api_key_in: args.get("apiKeyIn").and_then(|v| v.as_str()).map(str::to_string),
    };
    if auth.auth_type.is_empty() && auth.bearer_token.as_deref().is_some_and(|item| !item.is_empty()) {
        auth.auth_type = "bearer".into();
    }
    let body = arg_str(args, "body");
    let mut body_kind = arg_str(args, "bodyKind");
    if body_kind.is_empty() {
        body_kind = if body.is_empty() { "none".into() } else { "json".into() };
    }
    HttpRequestPayload {
        method,
        url: arg_str(args, "url"),
        headers: kv_list(args.get("headers")),
        query: kv_list(args.get("query")),
        body_kind,
        body,
        form: kv_list(args.get("form")),
        multipart: Vec::new(),
        auth,
        use_cache: None,
        request_id: None,
        timeout_ms: None,
    }
}

fn response_from_args(args: &Value) -> Result<HttpResponsePayload, String> {
    if let Some(raw) = args.get("response") {
        if let Ok(parsed) = serde_json::from_value::<HttpResponsePayload>(raw.clone()) {
            return Ok(parsed);
        }
        if let Some(obj) = raw.as_object() {
            let body = obj
                .get("body")
                .map(value_to_string)
                .unwrap_or_default();
            let status = obj
                .get("status")
                .and_then(|v| v.as_u64())
                .unwrap_or(200) as u16;
            return Ok(HttpResponsePayload {
                status,
                status_text: obj
                    .get("statusText")
                    .and_then(|v| v.as_str())
                    .unwrap_or("OK")
                    .to_string(),
                headers: Vec::new(),
                body: body.clone(),
                body_encoding: "utf8".into(),
                elapsed_ms: obj.get("elapsedMs").and_then(|v| v.as_u64()).unwrap_or(0),
                dns_ms: None,
                tls_ms: None,
                ttfb_ms: None,
                download_ms: None,
                total_ms: None,
                size_bytes: body.len(),
                content_type: obj
                    .get("contentType")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                from_cache: false,
                cache_age_ms: None,
                request_id: None,
            });
        }
    }
    let body = arg_str(args, "body");
    if body.is_empty() && args.get("response").is_none() {
        return Err("response or body is required".into());
    }
    let status = args.get("status").and_then(|v| v.as_u64()).unwrap_or(200) as u16;
    Ok(HttpResponsePayload {
        status,
        status_text: "OK".into(),
        headers: vec![ResponseHeader {
            key: "Content-Type".into(),
            value: "application/json".into(),
        }],
        body: body.clone(),
        body_encoding: "utf8".into(),
        elapsed_ms: 0,
        dns_ms: None,
        tls_ms: None,
        ttfb_ms: None,
        download_ms: None,
        total_ms: None,
        size_bytes: body.len(),
        content_type: Some("application/json".into()),
        from_cache: false,
        cache_age_ms: None,
        request_id: None,
    })
}

fn collection_run_from_workspace(args: &Value) -> Result<CollectionRunInput, String> {
    if let Some(raw) = args.get("input") {
        return serde_json::from_value(raw.clone()).map_err(|error| error.to_string());
    }
    let root = workspace_root()?;
    let payload = load_workspace(&root)?;
    let collection_id = arg_str(args, "collectionId");
    let collection_id = if collection_id.is_empty() {
        payload
            .collection_groups
            .first()
            .map(|group| group.id.clone())
            .unwrap_or_default()
    } else {
        collection_id
    };
    if collection_id.is_empty() {
        return Err("collectionId is required (or pass a full input object)".into());
    }
    let group = payload
        .collection_groups
        .iter()
        .find(|item| item.id == collection_id || item.name == collection_id)
        .ok_or_else(|| format!("Collection not found: {collection_id}"))?;
    let folder_path = {
        let value = arg_str(args, "folderPath");
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    };
    let requests: Vec<_> = payload
        .collections
        .iter()
        .filter(|item| item.collection_id == group.id)
        .filter(|item| match &folder_path {
            None => true,
            Some(path) => {
                let folder = item.folder.as_deref().unwrap_or("");
                folder == path || folder.starts_with(&format!("{path}/"))
            }
        })
        .cloned()
        .collect();
    if requests.is_empty() {
        return Err("No requests in that collection".into());
    }
    let env_name = arg_str(args, "envName");
    let environment = if env_name.is_empty() {
        payload.environments.first().cloned()
    } else {
        payload
            .environments
            .iter()
            .find(|item| item.name == env_name || item.id == env_name)
            .cloned()
    };
    Ok(CollectionRunInput {
        collection_id: group.id.clone(),
        collection_name: group.name.clone(),
        requests,
        environment,
        globals: Vec::new(),
        collection: Some(group.clone()),
        data_rows: Vec::new(),
        data_file_name: None,
        folder_path,
    })
}

fn tools() -> Value {
    json!([
        {
            "name": "pulse_interpolate",
            "description": "Expand Pulse {{variables}} using env + workspace secrets",
            "inputSchema": {
                "type": "object",
                "required": ["template"],
                "properties": {
                    "template": { "type": "string" },
                    "env": { "type": "object", "additionalProperties": { "type": "string" } }
                }
            }
        },
        {
            "name": "pulse_workspace_list",
            "description": "List collections and requests in PULSE_WORKSPACE",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "pulse_workspace_read",
            "description": "Read a saved request from the Git workspace by id, name, or filePath",
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
            "name": "pulse_workspace_send",
            "description": "Send a saved YAML request by id. Mutating methods need confirm=true.",
            "inputSchema": {
                "type": "object",
                "required": ["id"],
                "properties": {
                    "id": { "type": "string" },
                    "envName": { "type": "string" },
                    "env": { "type": "object", "additionalProperties": { "type": "string" } },
                    "confirm": { "type": "boolean" }
                }
            }
        },
        {
            "name": "pulse_workspace_envs",
            "description": "List environments in PULSE_WORKSPACE",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "pulse_workspace_history",
            "description": "Read agent history.jsonl from PULSE_WORKSPACE/.pulse/",
            "inputSchema": {
                "type": "object",
                "properties": { "limit": { "type": "integer", "default": 20 } }
            }
        },
        {
            "name": "pulse_workspace_pending",
            "description": "List mutating MCP calls waiting in .pulse/pending",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "pulse_workspace_search",
            "description": "Search YAML requests by id, name, method, or URL",
            "inputSchema": {
                "type": "object",
                "properties": { "query": { "type": "string" } }
            }
        },
        {
            "name": "pulse_workspace_delete",
            "description": "Delete a YAML request. Requires confirm=true.",
            "inputSchema": {
                "type": "object",
                "required": ["id"],
                "properties": { "id": { "type": "string" }, "confirm": { "type": "boolean" } }
            }
        },
        {
            "name": "pulse_workspace_status",
            "description": "Summarize PULSE_WORKSPACE counts and secret key names",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "pulse_workspace_init",
            "description": "Create pulse.yaml + collections/ + environments/ under PULSE_WORKSPACE (or workspace path)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": { "type": "string" },
                    "name": { "type": "string" }
                }
            }
        },
        {
            "name": "pulse_workspace_migrate",
            "description": "Migrate Pulse JSON dumps under the workspace into YAML",
            "inputSchema": {
                "type": "object",
                "properties": { "workspace": { "type": "string" } }
            }
        },
        {
            "name": "pulse_contract",
            "description": "Check YAML workspace contracts, or pass schema+body / previous+current for schema/breaking diffs",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "schema": { "type": "object" },
                    "body": {},
                    "previous": {},
                    "current": {}
                }
            }
        },
        {
            "name": "pulse_schema",
            "description": "Validate a JSON body against a (subset) JSON Schema",
            "inputSchema": {
                "type": "object",
                "required": ["body", "schema"],
                "properties": {
                    "body": {},
                    "schema": { "type": "object" }
                }
            }
        },
        {
            "name": "pulse_diff",
            "description": "Unified line diff between two JSON values",
            "inputSchema": {
                "type": "object",
                "required": ["left", "right"],
                "properties": {
                    "left": {},
                    "right": {}
                }
            }
        },
        {
            "name": "pulse_curl",
            "description": "Parse a cURL command into a Pulse request. Pass send=true to execute it.",
            "inputSchema": {
                "type": "object",
                "required": ["command"],
                "properties": {
                    "command": { "type": "string" },
                    "send": { "type": "boolean", "default": false }
                }
            }
        },
        {
            "name": "pulse_sse",
            "description": "Parse SSE text offline, or collect events from a URL (event/id/retry/data)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "SSE document to parse offline" },
                    "url": { "type": "string" },
                    "method": { "type": "string", "default": "GET" },
                    "headers": { "type": "object", "additionalProperties": { "type": "string" } },
                    "body": { "type": "string" },
                    "maxEvents": { "type": "integer", "default": 50 },
                    "timeoutMs": { "type": "integer", "default": 30000 },
                    "lastEventId": { "type": "string" },
                    "event": { "type": "string", "description": "Only keep events with this event: name" }
                }
            }
        },
        {
            "name": "pulse_graphql_ws",
            "description": "Build or parse graphql-ws / graphql-transport-ws frames",
            "inputSchema": {
                "type": "object",
                "required": ["kind"],
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": [
                            "protocols",
                            "connection_init",
                            "subscribe",
                            "start",
                            "complete",
                            "stop",
                            "ping",
                            "pong",
                            "parse"
                        ]
                    },
                    "id": { "type": "string" },
                    "query": { "type": "string" },
                    "variables": {},
                    "operationName": { "type": "string" },
                    "payload": { "type": "object" },
                    "auth": { "type": "object" },
                    "text": { "type": "string" },
                    "bearerToken": { "type": "string" }
                }
            }
        },
        {
            "name": "pulse_graphql",
            "description": "GraphQL helpers: send/introspect over HTTP, or offline body/summarize/format/operations",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["send", "body", "summarize", "format", "operations", "introspection_query"],
                        "description": "Default send when url is set; offline helpers otherwise"
                    },
                    "url": { "type": "string" },
                    "query": { "type": "string" },
                    "graphqlQuery": { "type": "string" },
                    "variables": {},
                    "graphqlVariables": {},
                    "operationName": { "type": "string" },
                    "bearerToken": { "type": "string" },
                    "headers": { "type": "object", "additionalProperties": { "type": "string" } },
                    "confirm": { "type": "boolean" },
                    "introspect": { "type": "boolean" },
                    "body": { "type": "string", "description": "Response/introspection JSON for summarize/format" },
                    "document": { "type": "string", "description": "GraphQL document for operations" }
                }
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
                    "headers": { "type": "object", "additionalProperties": { "type": "string" } },
                    "query": { "type": "object", "additionalProperties": { "type": "string" } },
                    "body": { "type": "string" },
                    "bodyKind": { "type": "string" },
                    "bearerToken": { "type": "string" },
                    "confirm": { "type": "boolean" }
                }
            }
        },
        {
            "name": "pulse_run_tests",
            "description": "Run a Pulse/Postman test script against a saved response (boa JS engine)",
            "inputSchema": {
                "type": "object",
                "required": ["script"],
                "properties": {
                    "script": { "type": "string" },
                    "response": { "type": "object" },
                    "body": { "type": "string" },
                    "status": { "type": "integer" }
                }
            }
        },
        {
            "name": "pulse_pre_request",
            "description": "Run a pre-request script and return environment mutations",
            "inputSchema": {
                "type": "object",
                "required": ["script"],
                "properties": {
                    "script": { "type": "string" },
                    "env": { "type": "object", "additionalProperties": { "type": "string" } }
                }
            }
        },
        {
            "name": "pulse_run_collection",
            "description": "Run a collection from PULSE_WORKSPACE (or a full CollectionRunInput). Mutating requests need confirm=true.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "collectionId": { "type": "string" },
                    "folderPath": { "type": "string" },
                    "envName": { "type": "string" },
                    "input": { "type": "object" },
                    "confirm": { "type": "boolean" }
                }
            }
        },
        {
            "name": "pulse_openapi_list",
            "description": "List OpenAPI 3 operations (method, path, summary, url, example body, response schema)",
            "inputSchema": {
                "type": "object",
                "required": ["spec"],
                "properties": {
                    "spec": { "description": "OpenAPI document as a JSON object or string" }
                }
            }
        },
        {
            "name": "pulse_mock_start",
            "description": "Start the local mock on 127.0.0.1:4010 from workspace examples or explicit routes",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "delayMs": { "type": "integer", "default": 0 },
                    "routes": { "type": "array", "description": "Optional MockRoute[] JSON; otherwise load PULSE_WORKSPACE examples" }
                }
            }
        },
        {
            "name": "pulse_mock_stop",
            "description": "Stop the local mock server started by pulse_mock_start",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "pulse_agent",
            "description": "Local intent router (no LLM). Offline-safe: help, parse curl/sse, workspace status/history, memory (remember/recall/forget/list memory), GraphQL summarize from body.",
            "inputSchema": {
                "type": "object",
                "required": ["input"],
                "properties": {
                    "input": { "type": "string", "description": "Natural utterance, pasted curl/SSE, or memory command" },
                    "body": { "type": "string", "description": "GraphQL introspection/response JSON for summarize" },
                    "workspace": { "type": "string", "description": "Override PULSE_WORKSPACE" },
                    "historyLimit": { "type": "integer", "default": 15 }
                }
            }
        },
        {
            "name": "pulse_help",
            "description": "List Pulse MCP tools and workspace resources",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ])
}

fn workspace_resources(root: &str) -> Vec<Value> {
    let mut resources = vec![
        json!({"uri": "pulse://workspace/requests", "name": "workspace-requests", "mimeType": "application/json"}),
        json!({"uri": "pulse://workspace/environments", "name": "workspace-environments", "mimeType": "application/json"}),
        json!({"uri": "pulse://workspace/history", "name": "workspace-history", "mimeType": "application/json"}),
        json!({"uri": "pulse://workspace/pending", "name": "workspace-pending", "mimeType": "application/json"}),
    ];
    if let Ok(payload) = load_workspace(root) {
        for item in payload.collections.iter().take(50) {
            resources.push(json!({
                "uri": format!("pulse://workspace/request/{}", item.id),
                "name": item.name,
                "mimeType": "application/json"
            }));
        }
    }
    resources
}

fn read_workspace_resource(uri: &str) -> Result<Value, String> {
    let root = workspace_root()?;
    let payload = load_workspace(&root)?;
    let contents = if uri == "pulse://workspace/requests" {
        serde_json::to_value(&payload.collections).unwrap_or(Value::Null)
    } else if uri == "pulse://workspace/environments" {
        serde_json::to_value(&payload.environments).unwrap_or(Value::Null)
    } else if uri == "pulse://workspace/history" {
        let mut history = read_agent_history(&root)?;
        if history.len() > 50 {
            history = history.split_off(history.len() - 50);
        }
        Value::Array(history)
    } else if uri == "pulse://workspace/pending" {
        json!(list_pending(&root)?)
    } else if let Some(id) = uri.strip_prefix("pulse://workspace/request/") {
        match find_saved(&payload, id) {
            Some(item) => serde_json::to_value(item).unwrap_or(Value::Null),
            None => return Err(format!("Resource not found: {uri}")),
        }
    } else {
        return Err(format!("Resource not found: {uri}"));
    };
    Ok(json!({
        "contents": [{
            "uri": uri,
            "mimeType": "application/json",
            "text": serde_json::to_string_pretty(&contents).unwrap_or_default()
        }]
    }))
}

async fn send_and_record(mut payload: HttpRequestPayload, request_meta: Value) -> Value {
    if let Ok(root) = workspace_root() {
        if let Ok(workspace) = load_workspace(&root) {
            payload.url = substitute_variables(&payload.url, &workspace.secrets);
            payload.body = substitute_variables(&payload.body, &workspace.secrets);
            if let Some(token) = payload.auth.bearer_token.as_mut() {
                *token = substitute_variables(token, &workspace.secrets);
            }
        }
    }
    match send_once(payload).await {
        Ok(response) => {
            let mut value = serde_json::to_value(&response).unwrap_or(Value::Null);
            if let Ok(root) = workspace_root() {
                if let Ok(workspace) = load_workspace(&root) {
                    redact_json(&mut value, &workspace.secrets);
                    let mut request_json = request_meta;
                    redact_json(&mut request_json, &workspace.secrets);
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
            }
            text(value.to_string(), false)
        }
        Err(error) => text(error, true),
    }
}

async fn dispatch_tool(name: &str, arguments: &Value) -> Value {
    match name {
        "pulse_agent" => {
            let input = arg_str(arguments, "input");
            let body = arg_str(arguments, "body");
            let workspace = arguments
                .get("workspace")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or_else(|| workspace_root().ok());
            let history_limit = arguments
                .get("historyLimit")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .unwrap_or(15);
            let opts = AgentExecuteOptions {
                workspace_root: workspace.as_deref(),
                graphql_body: if body.is_empty() { None } else { Some(body.as_str()) },
                history_limit,
                source: "mcp-agent",
                record_history: true,
            };
            match run_agent(&input, &opts) {
                Ok(result) => json_text(&serde_json::to_value(result).unwrap_or(json!({})), false),
                Err(error) => text(error, true),
            }
        }
        "pulse_help" => {
            let mut catalog = Map::new();
            catalog.insert("tools".into(), tools());
            catalog.insert(
                "streamAndContractTools".into(),
                json!(STREAM_AND_CONTRACT_TOOLS),
            );
            catalog.insert(
                "resources".into(),
                json!(workspace_root()
                    .map(|root| workspace_resources(&root))
                    .unwrap_or_default()),
            );
            json_text(&Value::Object(catalog), false)
        }
        "pulse_interpolate" => {
            let template = arg_str(arguments, "template");
            if template.is_empty() {
                return text("template is required", true);
            }
            let mut vars = extra_vars(arguments);
            if let Ok(root) = workspace_root() {
                if let Ok(payload) = load_workspace(&root) {
                    vars.extend(payload.secrets);
                }
            }
            text(substitute_variables(&template, &vars), false)
        }
        "pulse_workspace_list" => match workspace_root().and_then(|root| load_workspace(&root)) {
            Ok(payload) => json_text(&serde_json::to_value(&payload).unwrap_or(Value::Null), false),
            Err(error) => text(error, true),
        },
        "pulse_workspace_read" => {
            let id = arg_str(arguments, "id");
            match workspace_root().and_then(|root| load_workspace(&root)) {
                Ok(payload) => match find_saved(&payload, &id) {
                    Some(item) => json_text(&serde_json::to_value(item).unwrap_or(Value::Null), false),
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
        "pulse_workspace_send" => {
            let id = arg_str(arguments, "id");
            if id.is_empty() {
                return text("id is required", true);
            }
            let (root, payload) = match workspace_root().and_then(|root| {
                load_workspace(&root).map(|payload| (root, payload))
            }) {
                Ok(pair) => pair,
                Err(error) => return text(error, true),
            };
            let Some(saved) = find_saved(&payload, &id).cloned() else {
                return text(format!("Request not found: {id}"), true);
            };
            if is_mutating_method(&saved.request.method) && !confirmed(arguments) {
                let _ = write_pending(
                    &root,
                    &saved.id,
                    &json!({
                        "id": saved.id,
                        "method": saved.request.method,
                        "url": saved.request.url,
                        "source": "agent"
                    }),
                );
                return text(
                    "Mutating method requires confirm=true. Wrote .pulse/pending for desktop approval.",
                    true,
                );
            }
            let vars = merged_vars(&payload, &saved, arguments);
            let interpolated = interpolate_request(saved.request.clone(), &vars);
            let http = to_http_payload(&interpolated, Some(saved.id.clone()));
            send_and_record(
                http,
                json!({ "id": saved.id, "method": interpolated.method, "url": interpolated.url }),
            )
            .await
        }
        "pulse_workspace_envs" => match workspace_root().and_then(|root| load_workspace(&root)) {
            Ok(payload) => json_text(&serde_json::to_value(&payload.environments).unwrap_or(Value::Null), false),
            Err(error) => text(error, true),
        },
        "pulse_workspace_history" => {
            let limit = arguments.get("limit").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
            match workspace_root().and_then(|root| read_agent_history(&root)) {
                Ok(mut history) => {
                    if limit > 0 && history.len() > limit {
                        history = history.split_off(history.len() - limit);
                    }
                    json_text(&Value::Array(history), false)
                }
                Err(error) => text(error, true),
            }
        }
        "pulse_workspace_pending" => match workspace_root().and_then(|root| list_pending(&root)) {
            Ok(pending) => json_text(&json!(pending), false),
            Err(error) => text(error, true),
        },
        "pulse_workspace_search" => {
            let query = arg_str(arguments, "query").to_lowercase();
            match workspace_root().and_then(|root| load_workspace(&root)) {
                Ok(payload) => {
                    let hits: Vec<_> = payload
                        .collections
                        .iter()
                        .filter(|item| {
                            if query.is_empty() {
                                return true;
                            }
                            let haystack = format!(
                                "{} {} {} {} {}",
                                item.id,
                                item.name,
                                item.request.method,
                                item.request.url,
                                item.file_path.as_deref().unwrap_or("")
                            )
                            .to_lowercase();
                            haystack.contains(&query)
                        })
                        .cloned()
                        .collect();
                    json_text(&serde_json::to_value(hits).unwrap_or(Value::Null), false)
                }
                Err(error) => text(error, true),
            }
        }
        "pulse_workspace_delete" => {
            let id = arg_str(arguments, "id");
            if id.is_empty() {
                return text("id is required", true);
            }
            if !confirmed(arguments) {
                return text("Deleting a YAML request requires confirm=true", true);
            }
            match workspace_root().and_then(|root| delete_request(&root, &id)) {
                Ok(path) => json_text(&json!({ "deleted": path }), false),
                Err(error) => text(error, true),
            }
        }
        "pulse_workspace_status" => match workspace_root().and_then(|root| {
            load_workspace(&root).and_then(|payload| {
                let pending = list_pending(&root).unwrap_or_default().len();
                let history = read_agent_history(&root).unwrap_or_default().len();
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
                Ok(json!({
                    "root": payload.root,
                    "name": payload.name,
                    "requests": payload.collections.len(),
                    "environments": payload.environments.iter().map(|item| item.name.clone()).collect::<Vec<_>>(),
                    "pending": pending,
                    "history": history,
                    "secretKeys": secret_keys
                }))
            })
        }) {
            Ok(status) => json_text(&status, false),
            Err(error) => text(error, true),
        },
        "pulse_workspace_init" => {
            let root = arguments
                .get("workspace")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or_else(|| workspace_root().ok());
            let Some(root) = root else {
                return text("PULSE_WORKSPACE is not set (or pass workspace)", true);
            };
            let name = arg_str(arguments, "name");
            let name = if name.is_empty() { "Pulse".into() } else { name };
            match init_workspace(&root, &name) {
                Ok(path) => json_text(&json!({ "path": path.to_string_lossy() }), false),
                Err(error) => text(error, true),
            }
        }
        "pulse_workspace_migrate" => {
            let root = arguments
                .get("workspace")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or_else(|| workspace_root().ok());
            let Some(root) = root else {
                return text("PULSE_WORKSPACE is not set (or pass workspace)", true);
            };
            match migrate_pulse_json_dumps(&root) {
                Ok(migrated) => json_text(&json!({ "migrated": migrated }), false),
                Err(error) => text(error, true),
            }
        }
        "pulse_contract" => {
            if arguments.get("schema").is_some() && arguments.get("body").is_some() {
                let body = match arguments.get("body") {
                    Some(Value::String(text)) => text.clone(),
                    Some(other) => other.to_string(),
                    None => String::new(),
                };
                let schema = arguments.get("schema").cloned().unwrap_or(Value::Null);
                let report = compare_to_schema(&body, &schema);
                return json_text(&json!({ "ok": report.ok, "errors": report.errors }), false);
            }
            if arguments.get("previous").is_some() && arguments.get("current").is_some() {
                let previous = arguments.get("previous").cloned().unwrap_or(Value::Null);
                let current = arguments.get("current").cloned().unwrap_or(Value::Null);
                let errors = breaking_diff(&previous, &current);
                return json_text(&json!({ "ok": errors.is_empty(), "errors": errors }), false);
            }
            match workspace_root().and_then(|root| check_workspace(&root)) {
                Ok(report) => json_text(&json!({ "ok": report.ok, "errors": report.errors }), false),
                Err(error) => text(error, true),
            }
        }
        "pulse_schema" => {
            let body = match arguments.get("body") {
                Some(Value::String(text)) => text.clone(),
                Some(other) => other.to_string(),
                None => return text("body is required", true),
            };
            let Some(schema) = arguments.get("schema") else {
                return text("schema is required", true);
            };
            let report = compare_to_schema(&body, schema);
            json_text(&json!({ "ok": report.ok, "errors": report.errors }), !report.ok)
        }
        "pulse_diff" => {
            let Some(left) = arguments.get("left") else {
                return text("left is required", true);
            };
            let Some(right) = arguments.get("right") else {
                return text("right is required", true);
            };
            text(diff_compare(left, right), false)
        }
        "pulse_curl" => {
            let command = arg_str(arguments, "command");
            let command = if command.is_empty() {
                arg_str(arguments, "curl")
            } else {
                command
            };
            if command.trim().is_empty() {
                return text("command is required", true);
            }
            let payload = match curl_to_payload(&command) {
                Ok(payload) => payload,
                Err(error) => return text(error, true),
            };
            if arguments.get("send") == Some(&Value::Bool(true)) {
                if is_mutating_method(&payload.method) && !confirmed(arguments) {
                    return text(
                        format!(
                            "{} is mutating — pass confirm=true to send",
                            payload.method.to_uppercase()
                        ),
                        true,
                    );
                }
                match send_once(payload).await {
                    Ok(response) => {
                        json_text(&serde_json::to_value(response).unwrap_or(Value::Null), false)
                    }
                    Err(error) => text(error, true),
                }
            } else {
                json_text(&serde_json::to_value(payload).unwrap_or(Value::Null), false)
            }
        }
        "pulse_sse" => {
            let text_doc = arg_str(arguments, "text");
            if !text_doc.is_empty() {
                return match parse_sse_text(&text_doc) {
                    Ok(events) => {
                        let filter = arg_str(arguments, "event");
                        let events = if filter.trim().is_empty() {
                            events
                        } else {
                            pulse_core::filter_sse_events(&events, Some(&filter))
                                .into_iter()
                                .cloned()
                                .collect()
                        };
                        json_text(&serde_json::to_value(events).unwrap_or(Value::Null), false)
                    }
                    Err(error) => text(error, true),
                };
            }
            let url = arg_str(arguments, "url");
            if url.trim().is_empty() {
                return text("Provide url or text", true);
            }
            let headers = match arguments.get("headers") {
                Some(Value::Object(map)) => map
                    .iter()
                    .map(|(key, value)| (key.clone(), value_to_string(value)))
                    .collect(),
                _ => Vec::new(),
            };
            let options = SseCollectOptions {
                method: {
                    let method = arg_str(arguments, "method");
                    if method.is_empty() {
                        "GET".into()
                    } else {
                        method
                    }
                },
                headers,
                body: arguments
                    .get("body")
                    .map(value_to_string)
                    .filter(|item| !item.is_empty()),
                max_events: arguments
                    .get("maxEvents")
                    .and_then(|item| item.as_u64())
                    .unwrap_or(50) as usize,
                timeout_ms: arguments
                    .get("timeoutMs")
                    .and_then(|item| item.as_u64())
                    .unwrap_or(30_000),
                last_event_id: {
                    let id = arg_str(arguments, "lastEventId");
                    if id.is_empty() {
                        None
                    } else {
                        Some(id)
                    }
                },
                event_filter: {
                    let event = arg_str(arguments, "event");
                    if event.is_empty() {
                        None
                    } else {
                        Some(event)
                    }
                },
            };
            match collect_sse(&url, options).await {
                Ok(events) => json_text(&serde_json::to_value(events).unwrap_or(Value::Null), false),
                Err(error) => text(error, true),
            }
        }
        "pulse_graphql_ws" => {
            let kind = arg_str(arguments, "kind");
            match kind.as_str() {
                "protocols" => text(GRAPHQL_WS_PROTOCOLS, false),
                "connection_init" | "init" => {
                    let payload = if let Some(raw) = arguments.get("payload") {
                        Some(raw.clone())
                    } else if let Some(auth) = arguments.get("auth") {
                        connection_init_payload_from_auth(
                            auth.get("authType").and_then(|v| v.as_str()).unwrap_or("none"),
                            auth.get("bearerToken").and_then(|v| v.as_str()),
                            auth.get("apiKeyKey").and_then(|v| v.as_str()),
                            auth.get("apiKeyValue").and_then(|v| v.as_str()),
                            auth.get("apiKeyIn").and_then(|v| v.as_str()),
                        )
                    } else if !arg_str(arguments, "bearerToken").is_empty() {
                        connection_init_payload_from_auth(
                            "bearer",
                            Some(&arg_str(arguments, "bearerToken")),
                            None,
                            None,
                            None,
                        )
                    } else {
                        None
                    };
                    text(connection_init(payload), false)
                }
                "subscribe" | "start" => {
                    let id = arg_str(arguments, "id");
                    let id = if id.is_empty() { "1".into() } else { id };
                    let query = arg_str(arguments, "query");
                    if query.is_empty() {
                        return text("subscribe requires query", true);
                    }
                    let variables = arguments.get("variables").cloned();
                    let operation = arg_str(arguments, "operationName");
                    let op = if operation.is_empty() {
                        None
                    } else {
                        Some(operation.as_str())
                    };
                    let frame = if kind == "start" {
                        gql_start(&id, &query, variables, op)
                    } else {
                        gql_subscribe(&id, &query, variables, op)
                    };
                    text(frame, false)
                }
                "complete" => {
                    let id = arg_str(arguments, "id");
                    let id = if id.is_empty() { "1".into() } else { id };
                    text(gql_complete(&id), false)
                }
                "stop" => {
                    let id = arg_str(arguments, "id");
                    let id = if id.is_empty() { "1".into() } else { id };
                    text(gql_stop(&id), false)
                }
                "ping" => text(gql_ping(arguments.get("payload").cloned()), false),
                "pong" => text(gql_pong(arguments.get("payload").cloned()), false),
                "parse" => {
                    let raw = arg_str(arguments, "text");
                    match parse_message(&raw) {
                        Some(msg) => json_text(&serde_json::to_value(msg).unwrap_or(Value::Null), false),
                        None => text("null", false),
                    }
                }
                _ => text(
                    "kind must be protocols|connection_init|subscribe|start|complete|stop|ping|pong|parse",
                    true,
                ),
            }
        }
        "pulse_graphql" => {
            let kind = arg_str(arguments, "kind");
            let kind = if kind.is_empty() {
                if !arg_str(arguments, "url").is_empty() {
                    "send".into()
                } else if arguments.get("body").is_some() {
                    "summarize".into()
                } else if arguments.get("document").is_some() {
                    "operations".into()
                } else {
                    "body".into()
                }
            } else {
                kind
            };
            match kind.as_str() {
                "introspection_query" => text(INTROSPECTION_QUERY, false),
                "body" => {
                    let query = {
                        let q = arg_str(arguments, "query");
                        if q.is_empty() {
                            arg_str(arguments, "graphqlQuery")
                        } else {
                            q
                        }
                    };
                    let variables_json = match arguments
                        .get("variables")
                        .or_else(|| arguments.get("graphqlVariables"))
                    {
                        Some(Value::String(text)) => text.clone(),
                        Some(other) => other.to_string(),
                        None => "{}".into(),
                    };
                    let operation = arg_str(arguments, "operationName");
                    match build_graphql_body_raw(
                        &query,
                        &variables_json,
                        if operation.is_empty() {
                            None
                        } else {
                            Some(operation.as_str())
                        },
                    ) {
                        Ok(body) => text(body, false),
                        Err(error) => text(error, true),
                    }
                }
                "summarize" => {
                    let body = match arguments.get("body") {
                        Some(Value::String(text)) => text.clone(),
                        Some(other) => other.to_string(),
                        None => return text("body is required for summarize", true),
                    };
                    match summarize_graphql_schema(&body) {
                        Some(summary) => {
                            json_text(&serde_json::to_value(summary).unwrap_or(Value::Null), false)
                        }
                        None => text("No GraphQL __schema found in body", true),
                    }
                }
                "format" => {
                    let body = match arguments.get("body") {
                        Some(Value::String(text)) => text.clone(),
                        Some(other) => other.to_string(),
                        None => return text("body is required for format", true),
                    };
                    text(format_graphql_response(&body), false)
                }
                "operations" => {
                    let document = arg_str(arguments, "document");
                    let document = if document.is_empty() {
                        arg_str(arguments, "query")
                    } else {
                        document
                    };
                    if document.trim().is_empty() {
                        return text("document (or query) is required", true);
                    }
                    json_text(
                        &serde_json::to_value(list_graphql_operations(&document))
                            .unwrap_or(Value::Null),
                        false,
                    )
                }
                "send" => {
                    let url = arg_str(arguments, "url");
                    if url.is_empty() {
                        return text("url is required", true);
                    }
                    let introspect = arguments.get("introspect") == Some(&Value::Bool(true));
                    let query = if introspect {
                        INTROSPECTION_QUERY.to_string()
                    } else {
                        let q = arg_str(arguments, "query");
                        if q.is_empty() {
                            arg_str(arguments, "graphqlQuery")
                        } else {
                            q
                        }
                    };
                    if query.trim().is_empty() {
                        return text("query (or introspect=true) is required", true);
                    }
                    let variables_json = match arguments
                        .get("variables")
                        .or_else(|| arguments.get("graphqlVariables"))
                    {
                        Some(Value::String(text)) => text.clone(),
                        Some(other) => other.to_string(),
                        None => "{}".into(),
                    };
                    let operation = arg_str(arguments, "operationName");
                    let body = match build_graphql_body_raw(
                        &query,
                        &variables_json,
                        if operation.is_empty() {
                            None
                        } else {
                            Some(operation.as_str())
                        },
                    ) {
                        Ok(body) => body,
                        Err(error) => return text(error, true),
                    };
                    let mut args = arguments.clone();
                    if let Some(obj) = args.as_object_mut() {
                        obj.insert("method".into(), Value::String("POST".into()));
                        obj.insert("bodyKind".into(), Value::String("graphql".into()));
                        obj.insert("body".into(), Value::String(body));
                        if obj.get("headers").is_none() {
                            obj.insert(
                                "headers".into(),
                                json!({ "Content-Type": "application/json" }),
                            );
                        }
                    }
                    let http = http_from_args(&args);
                    let response = send_and_record(http, json!({ "method": "POST", "url": url })).await;
                    if introspect {
                        if let Some(content) = response
                            .get("content")
                            .and_then(|items| items.as_array())
                            .and_then(|items| items.first())
                            .and_then(|item| item.get("text"))
                            .and_then(|text| text.as_str())
                        {
                            if let Ok(http_value) = serde_json::from_str::<Value>(content) {
                                let body = http_value
                                    .get("body")
                                    .and_then(|item| item.as_str())
                                    .unwrap_or(content);
                                if let Some(summary) = summarize_graphql_schema(body) {
                                    return json_text(
                                        &json!({
                                            "http": http_value,
                                            "schema": summary,
                                        }),
                                        false,
                                    );
                                }
                            }
                        }
                    }
                    response
                }
                other => text(format!("Unknown pulse_graphql kind: {other}"), true),
            }
        }
        "pulse_send" => {
            let method = arg_str(arguments, "method");
            let method = if method.is_empty() { "GET".into() } else { method };
            let url = arg_str(arguments, "url");
            if url.is_empty() {
                return text("url is required", true);
            }
            if is_mutating_method(&method) && !confirmed(arguments) {
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
            let payload = http_from_args(arguments);
            send_and_record(payload, json!({ "method": method, "url": url })).await
        }
        "pulse_run_tests" => {
            let script = arg_str(arguments, "script");
            if script.is_empty() {
                return text("script is required", true);
            }
            match response_from_args(arguments) {
                Ok(response) => {
                    let result = run_http_tests(&script, &response);
                    json_text(&serde_json::to_value(result).unwrap_or(Value::Null), false)
                }
                Err(error) => text(error, true),
            }
        }
        "pulse_pre_request" => {
            let script = arg_str(arguments, "script");
            if script.is_empty() {
                return text("script is required", true);
            }
            let env = {
                let mut map = serde_json::Map::new();
                for item in extra_vars(arguments) {
                    map.insert(item.key, Value::String(item.value));
                }
                Value::Object(map)
            };
            let result = run_pre_request_script_with_env(&script, &env);
            json_text(&serde_json::to_value(result).unwrap_or(Value::Null), false)
        }
        "pulse_run_collection" => {
            let input = match collection_run_from_workspace(arguments) {
                Ok(input) => input,
                Err(error) => return text(error, true),
            };
            let mutating = input
                .requests
                .iter()
                .any(|item| is_mutating_method(&item.request.method));
            if mutating && !confirmed(arguments) {
                return text(
                    "Collection includes mutating methods — pass confirm=true to run.",
                    true,
                );
            }
            let result = run_collection(
                input,
                |payload| async move { send_once(payload).await },
                Some(|payloads: Vec<HttpRequestPayload>| async move {
                    let mut results = Vec::with_capacity(payloads.len());
                    for payload in payloads {
                        results.push(match send_once(payload).await {
                            Ok(response) => (Some(response), None),
                            Err(error) => (None, Some(error)),
                        });
                    }
                    results
                }),
            )
            .await;
            json_text(&serde_json::to_value(result).unwrap_or(Value::Null), false)
        }
        "pulse_openapi_list" => {
            let spec = match arguments.get("spec") {
                Some(Value::String(raw)) => match serde_json::from_str::<Value>(raw) {
                    Ok(value) => value,
                    Err(error) => return text(error.to_string(), true),
                },
                Some(value) => value.clone(),
                None => return text("spec is required", true),
            };
            let ops = list_operations(&spec);
            json_text(&serde_json::to_value(ops).unwrap_or(Value::Null), false)
        }
        "pulse_mock_start" => {
            let delay_ms = arguments
                .get("delayMs")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let routes: Result<Vec<MockRoute>, String> = if let Some(raw) = arguments.get("routes") {
                serde_json::from_value(raw.clone()).map_err(|error| error.to_string())
            } else {
                workspace_root().and_then(|root| {
                    load_workspace(&root).map(|payload| routes_from_saved_requests(&payload.collections))
                })
            };
            let routes = match routes {
                Ok(routes) if !routes.is_empty() => routes,
                Ok(_) => return text("No mock routes (save response examples first)", true),
                Err(error) => return text(error, true),
            };
            match start_mock_server_with_delay(routes, delay_ms).await {
                Ok(server) => {
                    let handle = server.handle.clone();
                    if let Ok(mut guard) = MOCK_STATE.lock() {
                        *guard = Some(server);
                    }
                    json_text(&serde_json::to_value(handle).unwrap_or(Value::Null), false)
                }
                Err(error) => text(error, true),
            }
        }
        "pulse_mock_stop" => {
            if let Ok(mut guard) = MOCK_STATE.lock() {
                if let Some(mut server) = guard.take() {
                    server.stop();
                }
            }
            text("ok", false)
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
                "capabilities": {
                    "tools": { "listChanged": false },
                    "resources": { "subscribe": false, "listChanged": false }
                },
                "serverInfo": { "name": "pulse", "version": VERSION }
            }
        }));
    }
    if method == "ping" {
        return Some(json!({ "jsonrpc": "2.0", "id": id, "result": {} }));
    }
    if method == "tools/list" {
        return Some(json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools() } }));
    }
    if method == "resources/list" {
        let resources = workspace_root()
            .map(|root| workspace_resources(&root))
            .unwrap_or_default();
        return Some(json!({ "jsonrpc": "2.0", "id": id, "result": { "resources": resources } }));
    }
    if method == "resources/templates/list" {
        return Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "resourceTemplates": [{
                    "uriTemplate": "pulse://workspace/request/{id}",
                    "name": "Workspace request",
                    "mimeType": "application/json"
                }]
            }
        }));
    }
    if method == "resources/read" {
        let uri = message
            .pointer("/params/uri")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Some(match read_workspace_resource(uri) {
            Ok(contents) => json!({ "jsonrpc": "2.0", "id": id, "result": contents }),
            Err(error) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32002, "message": error }
            }),
        });
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
