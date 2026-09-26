use crate::http::{
    build_request_headers, build_request_url, encode_response_body, HttpRequestPayload,
    ResponseHeader,
};
use crate::state::HttpState;
use crate::ws_state::{WsConnectionHandle, WsState, WsWriteMessage};
use futures_util::StreamExt;
use reqwest::header::{HeaderName, HeaderValue, ACCEPT, CACHE_CONTROL};
use reqwest::Method;
use serde::Serialize;
use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

const MAX_BUFFER_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SseConnectResult {
    pub connection_id: String,
    pub status: u16,
    pub headers: Vec<ResponseHeader>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedSseEvent {
    pub event: Option<String>,
    pub id: Option<String>,
    pub retry_ms: Option<u64>,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SseMessageEvent {
    connection_id: String,
    tab_id: String,
    data: String,
    binary: bool,
    timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    event: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_ms: Option<u64>,
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

/// Parse one SSE event block (WHATWG / HTML Living Standard).
pub fn parse_sse_block(block: &str) -> Option<ParsedSseEvent> {
    let mut event: Option<String> = None;
    let mut id: Option<String> = None;
    let mut retry_ms: Option<u64> = None;
    let mut data_lines: Vec<&str> = Vec::new();

    for raw_line in block.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.is_empty() || line.starts_with(':') {
            continue;
        }

        let (field, value) = match line.split_once(':') {
            Some((field, rest)) => {
                let value = rest.strip_prefix(' ').unwrap_or(rest);
                (field, value)
            }
            None => (line, ""),
        };

        match field {
            "event" => {
                if !value.is_empty() {
                    event = Some(value.to_string());
                }
            }
            "data" => data_lines.push(value),
            "id" => {
                // Spec: id field MUST NOT contain U+0000; empty id clears.
                if value.contains('\0') {
                    continue;
                }
                id = if value.is_empty() {
                    None
                } else {
                    Some(value.to_string())
                };
            }
            "retry" => {
                if value.chars().all(|ch| ch.is_ascii_digit()) {
                    if let Ok(ms) = value.parse::<u64>() {
                        retry_ms = Some(ms);
                    }
                }
            }
            _ => {}
        }
    }

    // Spec: no data lines → do not dispatch. Still surface id/retry control to the UI.
    if data_lines.is_empty() && id.is_none() && retry_ms.is_none() {
        return None;
    }

    Some(ParsedSseEvent {
        event: if data_lines.is_empty() { None } else { event },
        id,
        retry_ms,
        data: data_lines.join("\n"),
    })
}

fn next_event_boundary(buffer: &str) -> Option<usize> {
    let lf = buffer.find("\n\n").map(|i| (i, 2));
    let crlf = buffer.find("\r\n\r\n").map(|i| (i, 4));
    match (lf, crlf) {
        (Some((a, alen)), Some((b, blen))) => {
            if a <= b {
                Some(a + alen)
            } else {
                Some(b + blen)
            }
        }
        (Some((a, alen)), None) => Some(a + alen),
        (None, Some((b, blen))) => Some(b + blen),
        (None, None) => None,
    }
}

fn content_type_looks_like_sse(headers: &[ResponseHeader]) -> bool {
    headers.iter().any(|header| {
        header.key.eq_ignore_ascii_case("content-type")
            && header
                .value
                .to_ascii_lowercase()
                .contains("text/event-stream")
    })
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

    let method_raw = payload.method.trim().to_uppercase();
    let method = if method_raw.is_empty() || method_raw == "GET" {
        Method::GET
    } else {
        Method::from_bytes(method_raw.as_bytes()).map_err(|e| format!("Invalid HTTP method: {e}"))?
    };

    let mut headers = build_request_headers(&payload)?;
    if !headers.contains_key(ACCEPT) {
        headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    }
    if !headers.contains_key(CACHE_CONTROL) {
        headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    }

    // Optional Last-Event-ID from a dedicated header already on the payload,
    // or from a synthetic header the frontend injects.
    if let Some(last_id) = payload
        .headers
        .iter()
        .find(|item| item.enabled && item.key.eq_ignore_ascii_case("last-event-id"))
        .map(|item| item.value.trim())
        .filter(|value| !value.is_empty())
    {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_str("Last-Event-ID"),
            HeaderValue::from_str(last_id),
        ) {
            headers.insert(name, value);
        }
    }

    let mut request = http.client().request(method.clone(), url.clone()).headers(headers);

    request = match payload.body_kind.as_str() {
        "none" => request,
        "json" if !payload.body.trim().is_empty() => {
            let _: serde_json::Value = serde_json::from_str(&payload.body)
                .map_err(|e| format!("Invalid JSON body: {e}"))?;
            request
                .header("content-type", "application/json")
                .body(payload.body.clone())
        }
        "graphql" if !payload.body.trim().is_empty() => request
            .header("content-type", "application/json")
            .body(payload.body.clone()),
        "raw" | "json" | "graphql" if !payload.body.is_empty() => request.body(payload.body.clone()),
        "form" => {
            let pairs: Vec<(String, String)> = payload
                .form
                .iter()
                .filter(|item| item.enabled && !item.key.trim().is_empty())
                .map(|item| (item.key.trim().to_string(), item.value.clone()))
                .collect();
            if pairs.is_empty() {
                request
            } else {
                request.form(&pairs)
            }
        }
        _ => request,
    };

    let response = request.send().await.map_err(|error| error.to_string())?;

    let status = response.status().as_u16();
    let response_headers: Vec<ResponseHeader> = response
        .headers()
        .iter()
        .map(|(key, value)| ResponseHeader {
            key: key.to_string(),
            value: value.to_str().unwrap_or("").to_string(),
        })
        .collect();

    http.record_set_cookies(
        url.as_str(),
        &response_headers
            .iter()
            .map(|header| (header.key.clone(), header.value.clone()))
            .collect::<Vec<_>>(),
    );

    if !response.status().is_success() {
        let body_bytes = response.bytes().await.unwrap_or_default();
        let (body, _) = encode_response_body(&body_bytes, None);
        return Err(format!("SSE handshake failed ({status}): {body}"));
    }

    let connection_id = format!("sse_{:x}", now_ms());
    let _content_type_ok = content_type_looks_like_sse(&response_headers);
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
                            if buffer.len() > MAX_BUFFER_BYTES {
                                let _ = app_task.emit("ws-error", SseErrorEvent {
                                    connection_id: conn_task.clone(),
                                    tab_id: tab_task.clone(),
                                    message: format!(
                                        "SSE buffer exceeded {} bytes without an event boundary",
                                        MAX_BUFFER_BYTES
                                    ),
                                });
                                break;
                            }
                            while let Some(end) = next_event_boundary(&buffer) {
                                let sep = if buffer[..end].ends_with("\r\n\r\n") { 4 } else { 2 };
                                let block = buffer[..end - sep].to_string();
                                buffer = buffer[end..].to_string();
                                if let Some(parsed) = parse_sse_block(&block) {
                                    // Skip pure comment/empty dispatches
                                    if parsed.data.is_empty()
                                        && parsed.event.is_none()
                                        && parsed.id.is_none()
                                        && parsed.retry_ms.is_none()
                                    {
                                        continue;
                                    }
                                    let _ = app_task.emit("ws-message", SseMessageEvent {
                                        connection_id: conn_task.clone(),
                                        tab_id: tab_task.clone(),
                                        data: parsed.data,
                                        binary: false,
                                        timestamp: now_ms(),
                                        event: parsed.event,
                                        event_id: parsed.id,
                                        retry_ms: parsed.retry_ms,
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
    use super::{next_event_boundary, parse_sse_block};

    #[test]
    fn parse_sse_block_joins_data_lines() {
        let parsed = parse_sse_block("event: ping\ndata: hello\ndata: world").unwrap();
        assert_eq!(parsed.data, "hello\nworld");
        assert_eq!(parsed.event.as_deref(), Some("ping"));
    }

    #[test]
    fn parse_sse_block_reads_id_and_retry() {
        let parsed = parse_sse_block("id: 42\nretry: 1500\ndata: tick").unwrap();
        assert_eq!(parsed.id.as_deref(), Some("42"));
        assert_eq!(parsed.retry_ms, Some(1500));
        assert_eq!(parsed.data, "tick");
    }

    #[test]
    fn parse_sse_block_skips_comments() {
        let parsed = parse_sse_block(": keep-alive\ndata: ok").unwrap();
        assert_eq!(parsed.data, "ok");
    }

    #[test]
    fn parse_sse_block_ignores_null_in_id() {
        let parsed = parse_sse_block("id: a\0b\ndata: x").unwrap();
        assert!(parsed.id.is_none());
        assert_eq!(parsed.data, "x");
    }

    #[test]
    fn finds_crlf_and_lf_boundaries() {
        assert_eq!(next_event_boundary("a\n\nb"), Some(3));
        assert_eq!(next_event_boundary("a\r\n\r\nb"), Some(5));
        assert_eq!(next_event_boundary("data: hi"), None);
    }
}
