//! GraphQL HTTP helpers shared by desktop, CLI, and MCP.
//!
//! Covers request body construction, response formatting, and compact
//! introspection schema summaries (same shape as the desktop explorer).

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::OnceLock;

/// Compact introspection query used by the explorer / CLI / MCP.
pub const INTROSPECTION_QUERY: &str = r#"query PulseIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields {
        name
        description
        args { name }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphqlError {
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extensions: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphqlResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<GraphqlError>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphqlTypeRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub of_type: Option<Box<GraphqlTypeRef>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphqlField {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#type: Option<GraphqlTypeRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphqlType {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<GraphqlField>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphqlSchema {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query_type: Option<NamedType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mutation_type: Option<NamedType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subscription_type: Option<NamedType>,
    #[serde(default)]
    pub types: Vec<GraphqlType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NamedType {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSummary {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mutation_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_type: Option<String>,
    pub types: Vec<SchemaTypeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SchemaTypeSummary {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    pub name: String,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOperation {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Build a GraphQL POST body (`query` / `variables` / optional `operationName`).
pub fn build_body(
    query: &str,
    variables: Option<&Value>,
    operation_name: Option<&str>,
) -> Result<String, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("GraphQL query is required.".into());
    }
    let variables = match variables {
        None => json!({}),
        Some(Value::Null) => json!({}),
        Some(Value::Object(map)) => Value::Object(map.clone()),
        Some(_) => return Err("GraphQL variables must be a JSON object.".into()),
    };
    let mut payload = json!({
        "query": query,
        "variables": variables,
    });
    if let Some(name) = operation_name.map(str::trim).filter(|item| !item.is_empty()) {
        payload["operationName"] = Value::String(name.to_string());
    }
    Ok(payload.to_string())
}

/// Build a body from a variables JSON string (empty → `{}`).
pub fn build_body_raw(
    query: &str,
    variables_json: &str,
    operation_name: Option<&str>,
) -> Result<String, String> {
    let raw = variables_json.trim();
    let variables = if raw.is_empty() {
        None
    } else {
        Some(serde_json::from_str::<Value>(raw).map_err(|error| error.to_string())?)
    };
    build_body(query, variables.as_ref(), operation_name)
}

/// Validate query + variables without returning the body.
pub fn validate(query: &str, variables_json: &str, operation_name: Option<&str>) -> Option<String> {
    match build_body_raw(query, variables_json, operation_name) {
        Ok(_) => None,
        Err(message) => Some(message),
    }
}

pub fn parse_response(body: &str) -> Option<GraphqlResponse> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    if !parsed.is_object() {
        return None;
    }
    if parsed.get("data").is_none() && parsed.get("errors").is_none() {
        return None;
    }
    serde_json::from_value(parsed).ok()
}

pub fn format_response(body: &str) -> String {
    let Some(parsed) = parse_response(body) else {
        return body.to_string();
    };
    let mut sections = Vec::new();
    if let Some(errors) = parsed.errors.as_ref().filter(|items| !items.is_empty()) {
        let lines: Vec<String> = errors
            .iter()
            .map(|error| {
                let path = error
                    .path
                    .as_ref()
                    .filter(|items| !items.is_empty())
                    .map(|items| {
                        let joined = items
                            .iter()
                            .map(|item| match item {
                                Value::String(text) => text.clone(),
                                other => other.to_string(),
                            })
                            .collect::<Vec<_>>()
                            .join(".");
                        format!(" (path: {joined})")
                    })
                    .unwrap_or_default();
                format!("- {}{path}", error.message)
            })
            .collect();
        sections.push(format!("Errors:\n{}", lines.join("\n")));
    }
    if let Some(data) = parsed.data {
        let pretty = serde_json::to_string_pretty(&data).unwrap_or_else(|_| data.to_string());
        sections.push(format!("Data:\n{pretty}"));
    }
    if sections.is_empty() {
        body.to_string()
    } else {
        sections.join("\n\n")
    }
}

pub fn parse_schema(body: &str) -> Option<GraphqlSchema> {
    let parsed = parse_response(body)?;
    let data = parsed.data?;
    let schema = data.get("__schema")?.clone();
    serde_json::from_value(schema).ok()
}

/// Compact type list for CLI/MCP (skips `__*` introspection types without fields).
pub fn summarize_schema(body: &str) -> Option<SchemaSummary> {
    let schema = if let Ok(value) = serde_json::from_str::<Value>(body) {
        if value.get("data").is_some() {
            parse_schema(body)?
        } else if value.get("__schema").is_some() {
            serde_json::from_value(value.get("__schema")?.clone()).ok()?
        } else if value.get("types").is_some() {
            serde_json::from_value(value).ok()?
        } else {
            parse_schema(body)?
        }
    } else {
        parse_schema(body)?
    };
    Some(summarize_parsed_schema(&schema))
}

pub fn summarize_parsed_schema(schema: &GraphqlSchema) -> SchemaSummary {
    let mut types: Vec<SchemaTypeSummary> = visible_types(schema)
        .into_iter()
        .map(|item| SchemaTypeSummary {
            kind: item.kind.clone(),
            name: item.name.clone().unwrap_or_default(),
            fields: item
                .fields
                .as_ref()
                .map(|fields| {
                    fields
                        .iter()
                        .map(|field| field.name.clone())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
        })
        .collect();
    types.sort_by(|left, right| left.name.cmp(&right.name));
    SchemaSummary {
        query_type: schema
            .query_type
            .as_ref()
            .and_then(|item| item.name.clone()),
        mutation_type: schema
            .mutation_type
            .as_ref()
            .and_then(|item| item.name.clone()),
        subscription_type: schema
            .subscription_type
            .as_ref()
            .and_then(|item| item.name.clone()),
        types,
    }
}

pub fn visible_types(schema: &GraphqlSchema) -> Vec<&GraphqlType> {
    let mut types: Vec<&GraphqlType> = schema
        .types
        .iter()
        .filter(|item| {
            let name = item.name.as_deref().unwrap_or("");
            !name.is_empty()
                && !name.starts_with("__")
                && item
                    .fields
                    .as_ref()
                    .map(|fields| !fields.is_empty())
                    .unwrap_or(false)
        })
        .collect();
    types.sort_by(|left, right| {
        left.name
            .as_deref()
            .unwrap_or("")
            .cmp(right.name.as_deref().unwrap_or(""))
    });
    types
}

pub fn format_type_ref(type_ref: Option<&GraphqlTypeRef>) -> String {
    let Some(type_ref) = type_ref else {
        return String::new();
    };
    match type_ref.kind.as_deref() {
        Some("NON_NULL") => format!("{}!", format_type_ref(type_ref.of_type.as_deref())),
        Some("LIST") => format!("[{}]", format_type_ref(type_ref.of_type.as_deref())),
        _ => type_ref.name.clone().unwrap_or_default(),
    }
}

pub fn operation_kind_for_type(schema: &GraphqlSchema, type_name: Option<&str>) -> &'static str {
    let Some(name) = type_name.filter(|item| !item.is_empty()) else {
        return "query";
    };
    if schema
        .subscription_type
        .as_ref()
        .and_then(|item| item.name.as_deref())
        == Some(name)
    {
        return "subscription";
    }
    if schema
        .mutation_type
        .as_ref()
        .and_then(|item| item.name.as_deref())
        == Some(name)
    {
        return "mutation";
    }
    "query"
}

pub fn build_field_stub(operation: &str, operation_name: &str, field_name: &str) -> String {
    format!("{operation} {operation_name} {{\n  {field_name}\n}}")
}

/// List top-level named/anonymous operations in a document (best-effort scan).
pub fn list_operations(document: &str) -> Vec<DocumentOperation> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"(?m)(?P<kind>query|mutation|subscription)\b(?:\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*))?")
            .expect("operations regex")
    });
    let mut out = Vec::new();
    for caps in re.captures_iter(document) {
        let kind = caps
            .name("kind")
            .map(|item| item.as_str().to_string())
            .unwrap_or_else(|| "query".into());
        let name = caps.name("name").map(|item| item.as_str().to_string());
        out.push(DocumentOperation { kind, name });
    }
    if out.is_empty() && !document.trim().is_empty() {
        // Shorthand `{ field }` documents are queries.
        if document.trim().starts_with('{') {
            out.push(DocumentOperation {
                kind: "query".into(),
                name: None,
            });
        }
    }
    out
}

#[cfg(test)]
#[path = "__tests__/graphql_tests.rs"]
mod tests;
