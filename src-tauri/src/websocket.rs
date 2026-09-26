use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

use crate::http::{build_request_headers, build_request_url, HttpRequestPayload, ResponseHeader};
use crate::ws_state::{WsConnectionHandle, WsState, WsWriteMessage};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsConnectResult {
    pub connection_id: String,
    pub status: u16,
    pub headers: Vec<ResponseHeader>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subprotocol: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsMessageEvent {
    connection_id: String,
    tab_id: String,
    data: String,
    binary: bool,
    timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    event: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    event_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsCloseEvent {
    connection_id: String,
    tab_id: String,
    code: Option<u16>,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsErrorEvent {
    connection_id: String,
    tab_id: String,
    message: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn connection_id() -> String {
    format!("ws_{:x}", now_ms())
}

fn response_headers(
    response: &tokio_tungstenite::tungstenite::http::Response<Option<Vec<u8>>>,
) -> Vec<ResponseHeader> {
    response
        .headers()
        .iter()
        .map(|(key, value)| ResponseHeader {
            key: key.to_string(),
            value: value.to_str().unwrap_or("").to_string(),
        })
        .collect()
}

fn negotiated_subprotocol(headers: &[ResponseHeader]) -> Option<String> {
    headers
        .iter()
        .find(|header| header.key.eq_ignore_ascii_case("sec-websocket-protocol"))
        .map(|header| header.value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn emit_text_message(
    app: &AppHandle,
    connection_id: &str,
    tab_id: &str,
    data: String,
    event: Option<String>,
    event_id: Option<String>,
) {
    let _ = app.emit(
        "ws-message",
        WsMessageEvent {
            connection_id: connection_id.to_string(),
            tab_id: tab_id.to_string(),
            data,
            binary: false,
            timestamp: now_ms(),
            event,
            event_id,
        },
    );
}

pub async fn connect(
    app: AppHandle,
    state: &WsState,
    tab_id: String,
    payload: HttpRequestPayload,
) -> Result<WsConnectResult, String> {
    let url = build_request_url(&payload)?;
    let scheme = url.scheme();
    if scheme != "ws" && scheme != "wss" {
        return Err("WebSocket URL must use ws:// or wss://".to_string());
    }

    let mut request = url
        .as_str()
        .into_client_request()
        .map_err(|error| format!("Invalid WebSocket request: {error}"))?;

    let graphql_ws = payload.body_kind.eq_ignore_ascii_case("graphql");
    if graphql_ws {
        request.headers_mut().insert(
            tokio_tungstenite::tungstenite::http::HeaderName::from_static("sec-websocket-protocol"),
            tokio_tungstenite::tungstenite::http::HeaderValue::from_static(
                pulse_core::graphql_ws::GRAPHQL_WS_PROTOCOLS,
            ),
        );
    }

    let headers = build_request_headers(&payload)?;
    for (key, value) in headers.iter() {
        let key_str = key.as_str();
        // Keep GraphQL subprotocol offer — user headers must not clobber it.
        if graphql_ws && key_str.eq_ignore_ascii_case("sec-websocket-protocol") {
            continue;
        }
        if let (Ok(name), Ok(val)) = (
            tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(key_str.as_bytes()),
            tokio_tungstenite::tungstenite::http::HeaderValue::from_str(value.to_str().unwrap_or("")),
        ) {
            request.headers_mut().insert(name, val);
        }
    }

    let (ws_stream, response) = connect_async(request)
        .await
        .map_err(|error| format!("WebSocket handshake failed: {error}"))?;

    let connection_id = connection_id();
    let handshake_status = response.status().as_u16();
    let handshake_headers = response_headers(&response);
    let subprotocol = negotiated_subprotocol(&handshake_headers);

    let (mut write, mut read) = ws_stream.split();
    let (write_tx, mut write_rx) = tokio::sync::mpsc::unbounded_channel();
    let cancel = tokio_util::sync::CancellationToken::new();
    let write_cancel = cancel.clone();
    let write_tx_for_read = write_tx.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = write_cancel.cancelled() => break,
                message = write_rx.recv() => {
                    match message {
                        Some(WsWriteMessage::Text(data)) => {
                            if write.send(Message::Text(data.into())).await.is_err() {
                                break;
                            }
                        }
                        Some(WsWriteMessage::Binary(data)) => {
                            if write.send(Message::Binary(data.into())).await.is_err() {
                                break;
                            }
                        }
                        Some(WsWriteMessage::Ping) => {
                            if write.send(Message::Ping(Vec::new().into())).await.is_err() {
                                break;
                            }
                        }
                        Some(WsWriteMessage::Pong(data)) => {
                            if write.send(Message::Pong(data.into())).await.is_err() {
                                break;
                            }
                        }
                        Some(WsWriteMessage::Close) | None => {
                            let _ = write.send(Message::Close(None)).await;
                            break;
                        }
                    }
                }
            }
        }
    });

    let read_cancel = cancel.clone();
    let app_for_read = app.clone();
    let tab_id_for_read = tab_id.clone();
    let connection_id_for_read = connection_id.clone();
    let graphql_ws_read = graphql_ws;

    let read_task = tokio::spawn(async move {
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    let text = text.to_string();
                    let (event, event_id, gql_ping_payload) =
                        if let Some(parsed) = pulse_core::graphql_ws::parse_message(&text) {
                            let ping_payload = if graphql_ws_read && parsed.kind == "ping" {
                                Some(parsed.payload.clone())
                            } else {
                                None
                            };
                            (Some(parsed.kind), parsed.id, ping_payload)
                        } else {
                            (None, None, None)
                        };

                    emit_text_message(
                        &app_for_read,
                        &connection_id_for_read,
                        &tab_id_for_read,
                        text,
                        event,
                        event_id,
                    );

                    // graphql-transport-ws: reply to protocol ping with pong.
                    if let Some(payload) = gql_ping_payload {
                        let _ = write_tx_for_read.send(WsWriteMessage::Text(
                            pulse_core::graphql_ws::pong(payload),
                        ));
                    }
                }
                Ok(Message::Binary(data)) => {
                    let encoded = base64::engine::general_purpose::STANDARD.encode(data);
                    let _ = app_for_read.emit(
                        "ws-message",
                        WsMessageEvent {
                            connection_id: connection_id_for_read.clone(),
                            tab_id: tab_id_for_read.clone(),
                            data: encoded,
                            binary: true,
                            timestamp: now_ms(),
                            event: Some("binary".into()),
                            event_id: None,
                        },
                    );
                }
                Ok(Message::Ping(payload)) => {
                    emit_text_message(
                        &app_for_read,
                        &connection_id_for_read,
                        &tab_id_for_read,
                        format!("[ping] {} bytes", payload.len()),
                        Some("ping".into()),
                        None,
                    );
                    let _ = write_tx_for_read.send(WsWriteMessage::Pong(payload.to_vec()));
                }
                Ok(Message::Pong(payload)) => {
                    emit_text_message(
                        &app_for_read,
                        &connection_id_for_read,
                        &tab_id_for_read,
                        format!("[pong] {} bytes", payload.len()),
                        Some("pong".into()),
                        None,
                    );
                }
                Ok(Message::Close(frame)) => {
                    let _ = app_for_read.emit(
                        "ws-close",
                        WsCloseEvent {
                            connection_id: connection_id_for_read.clone(),
                            tab_id: tab_id_for_read.clone(),
                            code: frame.as_ref().map(|value| u16::from(value.code)),
                            reason: frame.map(|value| value.reason.to_string()),
                        },
                    );
                    break;
                }
                Err(error) => {
                    let _ = app_for_read.emit(
                        "ws-error",
                        WsErrorEvent {
                            connection_id: connection_id_for_read.clone(),
                            tab_id: tab_id_for_read.clone(),
                            message: error.to_string(),
                        },
                    );
                    break;
                }
                Ok(Message::Frame(_)) => {}
            }
        }

        read_cancel.cancel();
    });

    if graphql_ws {
        let init_payload = pulse_core::graphql_ws::connection_init_payload_from_auth(
            payload.auth.auth_type.as_str(),
            payload.auth.bearer_token.as_deref(),
            payload.auth.api_key_key.as_deref(),
            payload.auth.api_key_value.as_deref(),
            payload.auth.api_key_in.as_deref(),
        );
        let _ = write_tx.send(WsWriteMessage::Text(
            pulse_core::graphql_ws::connection_init(init_payload),
        ));
    }

    state.insert(
        connection_id.clone(),
        WsConnectionHandle {
            tab_id,
            write_tx,
            cancel,
            read_task,
        },
    );

    Ok(WsConnectResult {
        connection_id,
        status: handshake_status,
        headers: handshake_headers,
        subprotocol,
    })
}

pub async fn send_message(
    state: &WsState,
    connection_id: &str,
    data: String,
    binary: bool,
) -> Result<(), String> {
    let write_tx = state
        .get_write_tx(connection_id)
        .ok_or_else(|| "WebSocket connection not found".to_string())?;

    if binary {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data.as_bytes())
            .map_err(|error| format!("Invalid base64 payload: {error}"))?;
        write_tx
            .send(WsWriteMessage::Binary(bytes))
            .map_err(|_| "WebSocket connection is closed".to_string())
    } else {
        write_tx
            .send(WsWriteMessage::Text(data))
            .map_err(|_| "WebSocket connection is closed".to_string())
    }
}

pub async fn send_ping(state: &WsState, connection_id: &str) -> Result<(), String> {
    let write_tx = state
        .get_write_tx(connection_id)
        .ok_or_else(|| "WebSocket connection not found".to_string())?;

    write_tx
        .send(WsWriteMessage::Ping)
        .map_err(|_| "WebSocket connection is closed".to_string())
}

pub fn close_connection(state: &WsState, connection_id: &str) -> Result<(), String> {
    if state.close_connection(connection_id) {
        Ok(())
    } else {
        Err("WebSocket connection not found".to_string())
    }
}
