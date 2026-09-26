//! graphql-ws / graphql-transport-ws client frames (on top of raw WebSocket).

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const GRAPHQL_TRANSPORT_WS: &str = "graphql-transport-ws";
pub const GRAPHQL_WS: &str = "graphql-ws";

/// Value for `Sec-WebSocket-Protocol` offering both modern and legacy dialects.
pub const GRAPHQL_WS_PROTOCOLS: &str = "graphql-transport-ws, graphql-ws";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphqlWsMessage {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

pub fn connection_init(payload: Option<Value>) -> String {
    serde_json::to_string(&GraphqlWsMessage {
        kind: "connection_init".into(),
        id: None,
        payload,
    })
    .expect("json")
}

/// Build a common `connection_init` payload from HTTP-style auth.
/// Many GraphQL servers expect `{ "Authorization": "Bearer …" }` in the init payload.
pub fn connection_init_payload_from_auth(
    auth_type: &str,
    bearer_token: Option<&str>,
    api_key_key: Option<&str>,
    api_key_value: Option<&str>,
    api_key_in: Option<&str>,
) -> Option<Value> {
    let mut map = Map::new();
    match auth_type {
        "bearer" | "oauth2" => {
            let token = bearer_token.unwrap_or("").trim();
            if !token.is_empty() {
                map.insert(
                    "Authorization".into(),
                    Value::String(format!("Bearer {token}")),
                );
            }
        }
        "apiKey" => {
            let key = api_key_key.unwrap_or("").trim();
            let value = api_key_value.unwrap_or("");
            let loc = api_key_in.unwrap_or("header");
            if !key.is_empty() && loc != "query" {
                map.insert(key.to_string(), Value::String(value.to_string()));
            }
        }
        _ => {}
    }
    if map.is_empty() {
        None
    } else {
        Some(Value::Object(map))
    }
}

pub fn subscribe(id: &str, query: &str, variables: Option<Value>, operation_name: Option<&str>) -> String {
    let mut payload = json!({ "query": query });
    if let Some(variables) = variables {
        payload["variables"] = variables;
    }
    if let Some(name) = operation_name.filter(|item| !item.is_empty()) {
        payload["operationName"] = Value::String(name.to_string());
    }
    serde_json::to_string(&GraphqlWsMessage {
        kind: "subscribe".into(),
        id: Some(id.into()),
        payload: Some(payload),
    })
    .expect("json")
}

pub fn complete(id: &str) -> String {
    serde_json::to_string(&GraphqlWsMessage {
        kind: "complete".into(),
        id: Some(id.into()),
        payload: None,
    })
    .expect("json")
}

pub fn pong(payload: Option<Value>) -> String {
    serde_json::to_string(&GraphqlWsMessage {
        kind: "pong".into(),
        id: None,
        payload,
    })
    .expect("json")
}

pub fn parse_message(text: &str) -> Option<GraphqlWsMessage> {
    serde_json::from_str(text).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_subscribe_frame() {
        let raw = subscribe("1", "subscription { ping }", None, None);
        let parsed = parse_message(&raw).unwrap();
        assert_eq!(parsed.kind, "subscribe");
        assert_eq!(parsed.id.as_deref(), Some("1"));
    }

    #[test]
    fn connection_init_includes_bearer() {
        let payload = connection_init_payload_from_auth(
            "bearer",
            Some("tok"),
            None,
            None,
            None,
        )
        .unwrap();
        assert_eq!(
            payload.get("Authorization").and_then(Value::as_str),
            Some("Bearer tok")
        );
        let raw = connection_init(Some(payload));
        let parsed = parse_message(&raw).unwrap();
        assert_eq!(parsed.kind, "connection_init");
    }

    #[test]
    fn builds_pong_frame() {
        let raw = pong(None);
        assert_eq!(parse_message(&raw).unwrap().kind, "pong");
    }
}
