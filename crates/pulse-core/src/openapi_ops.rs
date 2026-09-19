//! Flatten OpenAPI paths into operations for a live explorer.

use serde::{Deserialize, Serialize};
use serde_json::Value;

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
            let schema = operation
                .pointer("/responses/200/content/application~1json/schema")
                .or_else(|| operation.pointer("/responses/201/content/application~1json/schema"));
            let response_schema = schema
                .map(|value| serde_json::to_string_pretty(value).unwrap_or_default())
                .unwrap_or_default();
            let example = operation.pointer("/requestBody/content/application~1json/example");
            let request_body = example
                .map(|value| serde_json::to_string_pretty(value).unwrap_or_default())
                .unwrap_or_default();
            ops.push(OpenApiOperation {
                method,
                path: path.clone(),
                summary,
                url: format!("{base}{path}"),
                request_body,
                response_schema,
            });
        }
    }
    ops.sort_by(|a, b| a.path.cmp(&b.path).then(a.method.cmp(&b.method)));
    ops
}
