//! Server-Sent Events parser (WHATWG / HTML Living Standard).

use serde::{Deserialize, Serialize};

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
        let events = buf
            .push("data: one\n\ndata: two\n\n")
            .unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].data, "one");
        assert_eq!(events[1].data, "two");
    }
}
