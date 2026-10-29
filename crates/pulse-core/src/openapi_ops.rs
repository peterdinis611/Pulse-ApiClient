//! OpenAPI list + full convert/export — mirrors `python/pulse/openapi.py`.

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

static PATH_PARAM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\{([^}]+)\}").unwrap());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenApiOperation {
    pub method: String,
    pub path: String,
    pub summary: String,
    pub url: String,
    #[serde(default)]
    pub request_body: String,
    #[serde(default)]
    pub response_schema: String,
}

fn short_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}_{nanos:x}")
}

fn kv(key: &str, value: &str) -> Value {
    json!({
        "id": short_id("kv"),
        "key": key,
        "value": value,
        "enabled": true,
    })
}

fn example_from_schema(schema: Option<&Value>) -> String {
    let Some(schema) = schema else {
        return String::new();
    };
    if let Some(example) = schema.get("example") {
        return match example {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
    }
    match schema.get("type").and_then(|v| v.as_str()) {
        Some("integer") => "1".into(),
        Some("boolean") => "true".into(),
        _ => {
            if let Some(first) = schema.get("enum").and_then(|v| v.as_array()).and_then(|a| a.first())
            {
                return match first {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
            }
            schema
                .get("default")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        }
    }
}

fn json_example(content: Option<&Value>) -> String {
    let Some(content) = content.and_then(|v| v.as_object()) else {
        return String::new();
    };
    let json_body = content
        .get("application/json")
        .or_else(|| content.values().next())
        .and_then(|v| v.as_object());
    let Some(json_body) = json_body else {
        return String::new();
    };
    if let Some(example) = json_body.get("example") {
        return match example {
            Value::String(s) => s.clone(),
            other => serde_json::to_string_pretty(other).unwrap_or_default(),
        };
    }
    if let Some(examples) = json_body.get("examples").and_then(|v| v.as_object()) {
        if let Some(first) = examples.values().next() {
            let value = first.get("value").unwrap_or(first);
            return match value {
                Value::String(s) => s.clone(),
                other => serde_json::to_string_pretty(other).unwrap_or_default(),
            };
        }
    }
    if let Some(example) = json_body
        .get("schema")
        .and_then(|s| s.get("example"))
    {
        return match example {
            Value::String(s) => s.clone(),
            other => serde_json::to_string_pretty(other).unwrap_or_default(),
        };
    }
    String::new()
}

fn response_schema_text(responses: &Value) -> String {
    let preferred = responses
        .get("200")
        .or_else(|| responses.get("201"))
        .or_else(|| {
            responses.as_object().and_then(|map| {
                map.values()
                    .find(|item| item.get("content").is_some())
            })
        });
    let Some(schema) = preferred
        .and_then(|item| item.pointer("/content/application~1json/schema"))
    else {
        return String::new();
    };
    serde_json::to_string_pretty(schema).unwrap_or_default()
}

fn status_test(responses: &Value) -> String {
    let mut codes = Vec::new();
    if let Some(map) = responses.as_object() {
        for key in map.keys() {
            if let Ok(code) = key.parse::<u16>() {
                if (200..300).contains(&code) {
                    codes.push(code);
                }
            }
        }
    }
    let Some(expected) = codes.into_iter().min() else {
        return String::new();
    };
    format!(
        "pulse.test(\"status\", function () {{\n    pulse.response.to.have.status({expected});\n}});\n"
    )
}

pub fn list_operations(spec: &Value) -> Vec<OpenApiOperation> {
    let base = spec
        .get("servers")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_end_matches('/');
    let Some(paths) = spec.get("paths").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    let mut ops = Vec::new();
    for (path, item) in paths {
        let Some(map) = item.as_object() else { continue };
        for (verb, operation) in map {
            let method = verb.to_uppercase();
            if !matches!(
                method.as_str(),
                "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
            ) {
                continue;
            }
            let summary = operation
                .get("summary")
                .and_then(|v| v.as_str())
                .or_else(|| operation.get("operationId").and_then(|v| v.as_str()))
                .unwrap_or(&format!("{method} {path}"))
                .to_string();
            ops.push(OpenApiOperation {
                method,
                path: path.clone(),
                summary,
                url: format!("{base}{path}"),
                request_body: json_example(
                    operation
                        .pointer("/requestBody/content")
                        .or_else(|| operation.get("requestBody").and_then(|b| b.get("content"))),
                ),
                response_schema: response_schema_text(
                    operation.get("responses").unwrap_or(&Value::Null),
                ),
            });
        }
    }
    ops.sort_by(|a, b| a.path.cmp(&b.path).then(a.method.cmp(&b.method)));
    ops
}

/// Full OpenAPI → Pulse dump (collectionGroups + collections).
pub fn convert(spec: &Value) -> Value {
    let title = spec
        .pointer("/info/title")
        .and_then(|v| v.as_str())
        .unwrap_or("OpenAPI Collection");
    let base = spec
        .get("servers")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_end_matches('/')
        .to_string();
    let collection_id = short_id("col");
    let mut folders: Vec<String> = Vec::new();
    let mut requests = Vec::new();

    let Some(paths) = spec.get("paths").and_then(|v| v.as_object()) else {
        return json!({
            "version": 1,
            "collectionGroups": [{
                "id": collection_id,
                "name": title,
                "source": "pulse",
                "folders": folders,
            }],
            "collections": requests,
        });
    };

    for (path, operations) in paths {
        let Some(operations) = operations.as_object() else { continue };
        let shared_params = operations
            .get("parameters")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        for (verb, operation) in operations {
            let method = verb.to_uppercase();
            if !matches!(
                method.as_str(),
                "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
            ) || !operation.is_object()
            {
                continue;
            }
            let name = operation
                .get("summary")
                .and_then(|v| v.as_str())
                .or_else(|| operation.get("operationId").and_then(|v| v.as_str()))
                .unwrap_or(&format!("{method} {path}"))
                .to_string();
            let mut params = shared_params.clone();
            if let Some(op_params) = operation.get("parameters").and_then(|v| v.as_array()) {
                params.extend(op_params.iter().cloned());
            }
            let mut query = Vec::new();
            let mut headers = vec![kv("Accept", "application/json")];
            let mut path_params = Vec::new();
            let mut seen_path = std::collections::HashSet::new();
            for param in &params {
                let Some(param) = param.as_object() else { continue };
                let location = param.get("in").and_then(|v| v.as_str()).unwrap_or("");
                let key = param.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let mut value = param
                    .get("example")
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    })
                    .unwrap_or_else(|| example_from_schema(param.get("schema")));
                if location == "query" && !key.is_empty() {
                    query.push(kv(key, &value));
                } else if location == "header" && !key.is_empty() && !key.eq_ignore_ascii_case("accept")
                {
                    headers.push(kv(key, &value));
                } else if location == "path" && !key.is_empty() {
                    if value.is_empty() {
                        value = "1".into();
                    }
                    path_params.push(kv(key, &value));
                    seen_path.insert(key.to_string());
                }
            }
            for cap in PATH_PARAM.captures_iter(path) {
                let name = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                if !name.is_empty() && !seen_path.contains(name) {
                    path_params.push(kv(name, "1"));
                    seen_path.insert(name.to_string());
                }
            }
            let body = json_example(operation.pointer("/requestBody/content"));
            let body_kind = if body.is_empty() { "none" } else { "json" };
            let folder = operation
                .get("tags")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if let Some(ref folder_name) = folder {
                if !folders.iter().any(|f| f == folder_name) {
                    folders.push(folder_name.clone());
                }
            }
            let request = json!({
                "id": short_id("req"),
                "name": name,
                "protocol": "http",
                "method": method,
                "url": format!("{base}{path}"),
                "headers": headers,
                "query": query,
                "pathParams": path_params,
                "bodyKind": body_kind,
                "body": body,
                "form": [],
                "multipart": [],
                "auth": { "authType": "inherit" },
                "tests": status_test(operation.get("responses").unwrap_or(&Value::Null)),
                "preRequestScript": "",
                "responseSchema": response_schema_text(operation.get("responses").unwrap_or(&Value::Null)),
            });
            requests.push(json!({
                "id": short_id("saved"),
                "name": name,
                "collectionId": collection_id,
                "folder": folder,
                "request": request,
            }));
        }
    }

    json!({
        "version": 1,
        "collectionGroups": [{
            "id": collection_id,
            "name": title,
            "source": "pulse",
            "folders": folders,
        }],
        "collections": requests,
    })
}

fn path_from_url(url: &str) -> String {
    let without_query = url.split('?').next().unwrap_or("");
    if let Some(idx) = without_query.find("://") {
        let rest = &without_query[idx + 3..];
        if let Some(slash) = rest.find('/') {
            rest[slash..].to_string()
        } else {
            "/".into()
        }
    } else if without_query.starts_with('/') {
        without_query.to_string()
    } else {
        format!("/{}", without_query)
    }
}

fn server_from_urls(urls: &[String]) -> String {
    for url in urls {
        if let Some(idx) = url.find("://") {
            let rest = &url[idx + 3..];
            let host = rest.split('/').next().unwrap_or("");
            if !host.is_empty() {
                return format!("{}{}", &url[..idx + 3], host);
            }
        }
    }
    "http://localhost".into()
}

/// Pulse dump → OpenAPI 3.0.3 spec.
pub fn export_spec(payload: &Value) -> Value {
    let groups = payload
        .get("collectionGroups")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut requests = payload
        .get("collections")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if requests.is_empty() {
        if let Some(items) = payload.get("item").and_then(|v| v.as_array()) {
            for item in items {
                if let Some(request) = item.get("request") {
                    requests.push(json!({
                        "id": item.get("id").cloned().unwrap_or(Value::Null),
                        "name": item.get("name"),
                        "request": request,
                    }));
                }
            }
        }
    }
    let title = groups
        .first()
        .and_then(|g| g.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Pulse");
    let mut paths: Map<String, Value> = Map::new();
    let urls: Vec<String> = requests
        .iter()
        .filter_map(|item| {
            item.get("request")
                .and_then(|r| r.get("url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .collect();
    for saved in &requests {
        let request = saved.get("request").unwrap_or(&Value::Null);
        let method = request
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("GET")
            .to_uppercase();
        if !matches!(
            method.as_str(),
            "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
        ) {
            continue;
        }
        let path = path_from_url(request.get("url").and_then(|v| v.as_str()).unwrap_or("/"));
        let mut operation = json!({
            "operationId": saved.get("id").or_else(|| request.get("id")),
            "summary": saved.get("name").or_else(|| request.get("name")).unwrap_or(&json!(format!("{method} {path}"))),
            "responses": { "200": { "description": "OK" } },
        });
        if let Some(schema_raw) = request
            .get("responseSchema")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            if let Ok(schema) = serde_json::from_str::<Value>(schema_raw) {
                operation["responses"] = json!({
                    "200": {
                        "description": "OK",
                        "content": { "application/json": { "schema": schema } },
                    }
                });
            }
        }
        let body = request
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if request.get("bodyKind").and_then(|v| v.as_str()) == Some("json") && !body.is_empty() {
            let example = serde_json::from_str::<Value>(body).unwrap_or(Value::String(body.into()));
            operation["requestBody"] =
                json!({ "content": { "application/json": { "example": example } } });
        }
        if let Some(query) = request.get("query").and_then(|v| v.as_array()) {
            let params: Vec<Value> = query
                .iter()
                .filter(|item| {
                    item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true)
                        && item
                            .get("key")
                            .and_then(|v| v.as_str())
                            .map(|s| !s.trim().is_empty())
                            .unwrap_or(false)
                })
                .map(|item| {
                    json!({
                        "name": item.get("key"),
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "default": item.get("value").and_then(|v| v.as_str()).unwrap_or(""),
                        }
                    })
                })
                .collect();
            if !params.is_empty() {
                operation["parameters"] = Value::Array(params);
            }
        }
        paths
            .entry(path)
            .or_insert_with(|| Value::Object(Map::new()))
            .as_object_mut()
            .unwrap()
            .insert(method.to_lowercase(), operation);
    }
    json!({
        "openapi": "3.0.3",
        "info": { "title": title, "version": "1.0.0" },
        "servers": [{ "url": server_from_urls(&urls) }],
        "paths": paths,
    })
}
