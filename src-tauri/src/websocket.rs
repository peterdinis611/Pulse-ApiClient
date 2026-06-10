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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsMessageEvent {
    connection_id: String,
    tab_id: String,
    data: String,
    binary: bool,
    timestamp: u64,
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

    let headers = build_request_headers(&payload)?;
    for (key, value) in headers.iter() {
        if let (Ok(name), Ok(val)) = (
            tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(key.as_str().as_bytes()),
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

    let (mut write, mut read) = ws_stream.split();
    let (write_tx, mut write_rx) = tokio::sync::mpsc::unbounded_channel();
    let cancel = tokio_util::sync::CancellationToken::new();
    let write_cancel = cancel.clone();

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

    let read_task = tokio::spawn(async move {
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    let _ = app_for_read.emit(
                        "ws-message",
                        WsMessageEvent {
                            connection_id: connection_id_for_read.clone(),
                            tab_id: tab_id_for_read.clone(),
                            data: text.to_string(),
                            binary: false,
                            timestamp: now_ms(),
                        },
                    );
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
                        },
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
                _ => {}
            }
        }

        read_cancel.cancel();
    });

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
