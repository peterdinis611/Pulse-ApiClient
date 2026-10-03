//! Server-Sent Events parser + bounded stream collect (WHATWG / HTML Living Standard).

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, CACHE_CONTROL};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSseEvent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_ms: Option<u64>,
    pub data: String,
}

#[derive(Debug, Clone, Default)]
pub struct SseCollectOptions {
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub max_events: usize,
    pub timeout_ms: u64,
    pub last_event_id: Option<String>,
    pub event_filter: Option<String>,
}

/// Parse one SSE event block (fields between blank-line delimiters).
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

    // Spec: no data lines → do not dispatch. Still surface id/retry control.
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

/// Index just past the next event delimiter (`\n\n` or `\r\n\r\n`).
pub fn next_event_boundary(buffer: &str) -> Option<usize> {
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

/// Incremental SSE buffer — feed chunks, drain complete events.
#[derive(Debug, Default)]
pub struct SseBuffer {
    buffer: String,
    max_bytes: usize,
}

impl SseBuffer {
    pub fn new(max_bytes: usize) -> Self {
        Self {
            buffer: String::new(),
            max_bytes: max_bytes.max(1024),
        }
    }

    pub fn push(&mut self, chunk: &str) -> Result<Vec<ParsedSseEvent>, String> {
        let chunk = chunk.strip_prefix('\u{feff}').unwrap_or(chunk);
        self.buffer.push_str(chunk);
        if self.buffer.len() > self.max_bytes {
            return Err(format!(
                "SSE buffer exceeded {} bytes without an event boundary",
                self.max_bytes
            ));
        }
        let mut events = Vec::new();
        while let Some(end) = next_event_boundary(&self.buffer) {
            let sep = if self.buffer[..end].ends_with("\r\n\r\n") {
                4
            } else {
                2
            };
            let block = self.buffer[..end - sep].to_string();
            self.buffer = self.buffer[end..].to_string();
            if let Some(parsed) = parse_sse_block(&block) {
                if parsed.data.is_empty()
                    && parsed.event.is_none()
                    && parsed.id.is_none()
                    && parsed.retry_ms.is_none()
                {
                    continue;
                }
                events.push(parsed);
            }
        }
        Ok(events)
    }

    pub fn remaining(&self) -> &str {
        &self.buffer
    }
}

/// Parse a complete SSE document (or partial stream text) into events.
pub fn parse_sse_text(text: &str) -> Result<Vec<ParsedSseEvent>, String> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut buf = SseBuffer::new(16 * 1024 * 1024);
    let mut events = buf.push(text)?;
    // Trailing block without final delimiter — still try once.
    if !buf.remaining().trim().is_empty() {
        if let Some(parsed) = parse_sse_block(buf.remaining()) {
            events.push(parsed);
        }
    }
    Ok(events)
}

pub fn latest_event_id(events: &[ParsedSseEvent]) -> Option<&str> {
    events
        .iter()
        .rev()
        .find_map(|event| event.id.as_deref().filter(|id| !id.is_empty()))
}

pub fn latest_retry_ms(events: &[ParsedSseEvent]) -> Option<u64> {
    events.iter().rev().find_map(|event| event.retry_ms)
}

pub fn filter_events<'a>(
    events: &'a [ParsedSseEvent],
    event_name: Option<&str>,
) -> Vec<&'a ParsedSseEvent> {
    let Some(needle) = event_name.map(str::trim).filter(|item| !item.is_empty()) else {
        return events.iter().collect();
    };
    events
        .iter()
        .filter(|event| {
            event
                .event
                .as_deref()
                .unwrap_or("message")
                .eq_ignore_ascii_case(needle)
        })
        .collect()
}

/// Open an HTTP SSE stream and collect up to `max_events` (shared by CLI / MCP / native).
pub async fn collect_sse(url: &str, options: SseCollectOptions) -> Result<Vec<ParsedSseEvent>, String> {
    let max_events = options.max_events.max(1);
    let timeout = Duration::from_millis(options.timeout_ms.max(1));
    let method_raw = if options.method.trim().is_empty() {
        "GET".to_string()
    } else {
        options.method.trim().to_uppercase()
    };
    let method = Method::from_bytes(method_raw.as_bytes())
        .map_err(|error| format!("Invalid HTTP method: {error}"))?;

    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    for (key, value) in &options.headers {
        let name = HeaderName::from_str(key.trim())
            .map_err(|error| format!("Invalid header name '{key}': {error}"))?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|error| format!("Invalid header value for '{key}': {error}"))?;
        headers.insert(name, header_value);
    }
    if let Some(last_id) = options
        .last_event_id
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
    {
        headers.insert(
            HeaderName::from_static("last-event-id"),
            HeaderValue::from_str(last_id).map_err(|error| format!("Invalid Last-Event-ID: {error}"))?,
        );
    }

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| error.to_string())?;

    let mut request = client.request(method.clone(), url).headers(headers);
    if let Some(body) = options.body.as_ref().filter(|item| !item.is_empty()) {
        if method != Method::GET && method != Method::HEAD {
            request = request.body(body.clone());
        }
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("SSE handshake failed ({status}): {body}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = SseBuffer::new(4 * 1024 * 1024);
    let mut events = Vec::new();
    let filter = options.event_filter.clone();

    while events.len() < max_events {
        match tokio::time::timeout(timeout, stream.next()).await {
            Ok(Some(Ok(chunk))) => {
                let text = String::from_utf8_lossy(&chunk);
                for event in buffer.push(&text)? {
                    if matches_event_filter(&event, filter.as_deref()) {
                        events.push(event);
                        if events.len() >= max_events {
                            break;
                        }
                    }
                }
            }
            Ok(Some(Err(error))) => return Err(error.to_string()),
            Ok(None) => break,
            Err(_) => break,
        }
    }

    Ok(events)
}

fn matches_event_filter(event: &ParsedSseEvent, filter: Option<&str>) -> bool {
    let Some(needle) = filter.map(str::trim).filter(|item| !item.is_empty()) else {
        return true;
    };
    event
        .event
        .as_deref()
        .unwrap_or("message")
        .eq_ignore_ascii_case(needle)
}

/// Human-readable WebSocket close code label (RFC 6455 + common extensions).
pub fn ws_close_code_label(code: u16) -> &'static str {
    match code {
        1000 => "normal closure",
        1001 => "going away",
        1002 => "protocol error",
        1003 => "unsupported data",
        1005 => "no status received",
        1006 => "abnormal closure",
        1007 => "invalid frame payload",
        1008 => "policy violation",
        1009 => "message too big",
        1010 => "mandatory extension",
        1011 => "internal error",
        1012 => "service restart",
        1013 => "try again later",
        1014 => "bad gateway",
        1015 => "TLS handshake",
        _ => "close",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn buffer_drains_multiple_events() {
        let mut buf = SseBuffer::new(4096);
        let events = buf.push("data: one\n\ndata: two\n\n").unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].data, "one");
        assert_eq!(events[1].data, "two");
    }

    #[test]
    fn strips_bom_and_tracks_latest_fields() {
        let events = parse_sse_text("\u{feff}id: a\nretry: 1000\ndata: 1\n\nid: b\ndata: 2\n\n").unwrap();
        assert_eq!(latest_event_id(&events), Some("b"));
        assert_eq!(latest_retry_ms(&events), Some(1000));
        assert_eq!(filter_events(&events, Some("message")).len(), 2);
    }

    #[test]
    fn close_code_labels() {
        assert_eq!(ws_close_code_label(1000), "normal closure");
        assert_eq!(ws_close_code_label(1006), "abnormal closure");
    }
}
