use crate::http::{build_request_headers, build_request_url, HttpRequestPayload, ResponseHeader};
use crate::state::HttpState;
use crate::ws_state::{WsConnectionHandle, WsState, WsWriteMessage};
use futures_util::StreamExt;
use reqwest::header::{HeaderValue, ACCEPT, CACHE_CONTROL};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SseConnectResult {
    pub connection_id: String,
    pub status: u16,
    pub headers: Vec<ResponseHeader>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SseMessageEvent {
    connection_id: String,
    tab_id: String,
    data: String,
    binary: bool,
    timestamp: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SseCloseEvent {
    connection_id: String,
    tab_id: String,
    code: Option<u16>,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SseErrorEvent {
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

fn parse_sse_block(block: &str) -> Option<String> {
    let mut data = Vec::new();
    for line in block.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() || trimmed.starts_with(':') {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("data:") {
            data.push(rest.trim_start());
        }
    }
    if data.is_empty() {
        None
    } else {
        Some(data.join("\n"))
    }
}

pub async fn connect(
    app: AppHandle,
    http: &HttpState,
    ws: &WsState,
    tab_id: String,
    payload: HttpRequestPayload,
) -> Result<SseConnectResult, String> {
    let url = build_request_url(&payload)?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("SSE URL must use http:// or https://".to_string());
    }

    let mut headers = build_request_headers(&payload)?;
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));

    let response = http
        .client()
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status().as_u16();
    let response_headers: Vec<ResponseHeader> = response
        .headers()
        .iter()
        .map(|(key, value)| ResponseHeader {
            key: key.to_string(),
            value: value.to_str().unwrap_or("").to_string(),
        })
        .collect();

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("SSE handshake failed ({status}): {body}"));
    }

    let connection_id = format!("sse_{:x}", now_ms());
    let cancel = CancellationToken::new();
    let (write_tx, _write_rx) = mpsc::unbounded_channel::<WsWriteMessage>();
    let mut stream = response.bytes_stream();
    let app_task = app.clone();
    let tab_task = tab_id.clone();
    let conn_task = connection_id.clone();
    let cancel_task = cancel.clone();

    let read_task = tokio::spawn(async move {
        let mut buffer = String::new();
        loop {
            tokio::select! {
                _ = cancel_task.cancelled() => break,
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            buffer.push_str(&String::from_utf8_lossy(&bytes));
                            while let Some(index) = buffer.find("\n\n") {
                                let block = buffer[..index].to_string();
                                buffer = buffer[index + 2..].to_string();
                                if let Some(data) = parse_sse_block(&block) {
                                    let _ = app_task.emit("ws-message", SseMessageEvent {
                                        connection_id: conn_task.clone(),
                                        tab_id: tab_task.clone(),
                                        data,
                                        binary: false,
                                        timestamp: now_ms(),
                                    });
                                }
                            }
                        }
                        Some(Err(error)) => {
                            let _ = app_task.emit("ws-error", SseErrorEvent {
                                connection_id: conn_task.clone(),
                                tab_id: tab_task.clone(),
                                message: error.to_string(),
                            });
                            break;
                        }
                        None => break,
                    }
                }
            }
        }
        let _ = app_task.emit(
            "ws-close",
            SseCloseEvent {
                connection_id: conn_task,
                tab_id: tab_task,
                code: None,
                reason: Some("stream ended".into()),
            },
        );
    });

    ws.insert(
        connection_id.clone(),
        WsConnectionHandle {
            tab_id,
            write_tx,
            cancel,
            read_task,
        },
    );

    Ok(SseConnectResult {
        connection_id,
        status,
        headers: response_headers,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_sse_block;

    #[test]
    fn parse_sse_block_joins_data_lines() {
        let data = parse_sse_block("event: ping\ndata: hello\ndata: world").unwrap();
        assert_eq!(data, "hello\nworld");
    }
}
