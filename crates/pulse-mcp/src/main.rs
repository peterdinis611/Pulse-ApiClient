use std::io::{self, BufRead, Write};

use pulse_core::check_workspace;
use pulse_core::interpolate_request;
use pulse_core::openapi_ops::list_operations;
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
use std::sync::Mutex;

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
            "name": "pulse_contract",
            "description": "Check YAML workspace contracts (schema + breaking diffs)",
            "inputSchema": { "type": "object", "properties": {} }
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
        "pulse_help" => {
            let mut catalog = Map::new();
            catalog.insert("tools".into(), tools());
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
        "pulse_contract" => match workspace_root().and_then(|root| check_workspace(&root)) {
            Ok(report) => json_text(&json!({ "ok": report.ok, "errors": report.errors }), false),
            Err(error) => text(error, true),
        },
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
