//! graphql-ws / graphql-transport-ws client frames (on top of raw WebSocket).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const GRAPHQL_TRANSPORT_WS: &str = "graphql-transport-ws";
pub const GRAPHQL_WS: &str = "graphql-ws";

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
}
