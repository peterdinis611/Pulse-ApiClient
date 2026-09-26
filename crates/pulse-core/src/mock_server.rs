//! Local HTTP mock from saved examples. Binds a locked loopback port and echoes only example headers.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::time::sleep;

/// Default loopback port Pulse tries to lock for the mock server.
pub const LOCKED_MOCK_PORT: u16 = 4010;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockHeader {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRoute {
    pub method: String,
    pub path: String,
    #[serde(default = "default_status")]
    pub status: u16,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub content_type: String,
    #[serde(default)]
    pub headers: Vec<MockHeader>,
    #[serde(default)]
    pub example_name: String,
}

fn default_status() -> u16 {
    200
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockServerHandle {
    pub url: String,
    pub port: u16,
    pub locked: bool,
    pub route_count: usize,
    pub delay_ms: u64,
}

pub struct MockServer {
    shutdown: Option<oneshot::Sender<()>>,
    pub handle: MockServerHandle,
}

impl MockServer {
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

impl Drop for MockServer {
    fn drop(&mut self) {
        self.stop();
    }
}

pub async fn start_mock_server(routes: Vec<MockRoute>) -> Result<MockServer, String> {
    start_mock_server_with_delay(routes, 0).await
}

pub async fn start_mock_server_with_delay(
    routes: Vec<MockRoute>,
    delay_ms: u64,
) -> Result<MockServer, String> {
    start_mock_server_on(routes, Some(LOCKED_MOCK_PORT), delay_ms).await
}

pub async fn start_mock_server_on(
    routes: Vec<MockRoute>,
    port: Option<u16>,
    delay_ms: u64,
) -> Result<MockServer, String> {
    let wanted = port.unwrap_or(LOCKED_MOCK_PORT);
    let (listener, bound, locked) = bind_loopback(wanted).await?;
    let route_count = routes.len();
    let base_delay = delay_ms.min(60_000);
    let (tx, mut rx) = oneshot::channel();
    let routes = Arc::new(routes);
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut rx => break,
                accepted = listener.accept() => {
                    let Ok((mut stream, _)) = accepted else { continue };
                    let routes = routes.clone();
                    tokio::spawn(async move {
                        let mut buf = vec![0u8; 16384];
                        let Ok(n) = stream.read(&mut buf).await else { return };
                        let request = String::from_utf8_lossy(&buf[..n]);
                        let wait_ms = resolve_delay(&request, base_delay);
                        if wait_ms > 0 {
                            sleep(Duration::from_millis(wait_ms)).await;
                        }
                        let response = render_response(&request, &routes);
                        let _ = stream.write_all(response.as_bytes()).await;
                    });
                }
            }
        }
    });
    Ok(MockServer {
        shutdown: Some(tx),
        handle: MockServerHandle {
            url: format!("http://127.0.0.1:{bound}"),
            port: bound,
            locked,
            route_count,
            delay_ms: base_delay,
        },
    })
}

async fn bind_loopback(wanted: u16) -> Result<(TcpListener, u16, bool), String> {
    if wanted == 0 {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        return Ok((listener, port, false));
    }
    match TcpListener::bind(("127.0.0.1", wanted)).await {
        Ok(listener) => Ok((listener, wanted, true)),
        Err(error) => Err(format!(
            "Could not lock 127.0.0.1:{wanted} ({error}). Stop the other mock or pick a free port."
        )),
    }
}

/// Base delay from start options, overridable with `?delay=ms` (capped at 60s).
fn resolve_delay(request: &str, base_delay: u64) -> u64 {
    let first = request.lines().next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let _method = parts.next();
    let target = parts.next().unwrap_or("/");
    let query_raw = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let query = parse_query(query_raw);
    let from_query = query
        .get("delay")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
        .min(60_000);
    from_query.max(base_delay)
}

fn render_response(request: &str, routes: &[MockRoute]) -> String {
    let (status, reason, headers, body) = match match_route(request, routes) {
        Some(route) => {
            let reason = reason_phrase(route.status);
            (route.status, reason, visible_headers(route), route.body.clone())
        }
        None => (
            404,
            "Not Found",
            Vec::new(),
            "{\"error\":\"not mocked\"}".into(),
        ),
    };
    let mut out = format!("HTTP/1.1 {status} {reason}\r\n");
    for (key, value) in headers {
        out.push_str(&format!("{key}: {value}\r\n"));
    }
    out.push_str("\r\n");
    out.push_str(&body);
    out
}

fn visible_headers(route: &MockRoute) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for header in &route.headers {
        let key = header.key.trim();
        if key.is_empty() || is_hidden_header(key) {
            continue;
        }
        out.push((key.to_string(), header.value.clone()));
    }
    let has_content_type = out.iter().any(|(key, _)| key.eq_ignore_ascii_case("content-type"));
    if !has_content_type && !route.content_type.trim().is_empty() {
        out.push(("Content-Type".into(), route.content_type.clone()));
    }
    out
}

fn is_hidden_header(name: &str) -> bool {
    let lower = name.trim().to_ascii_lowercase();
    lower.starts_with("x-pulse-")
        || lower == "x-request-id"
        || lower == "server"
        || lower == "date"
        || lower == "connection"
        || lower == "keep-alive"
        || lower == "transfer-encoding"
        || lower == "content-length"
}

fn match_route<'a>(request: &'a str, routes: &'a [MockRoute]) -> Option<&'a MockRoute> {
    let first = request.lines().next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_uppercase();
    let target = parts.next().unwrap_or("/");
    let (path_raw, query_raw) = target.split_once('?').unwrap_or((target, ""));
    let path = path_raw.split('?').next().unwrap_or("/");
    let query = parse_query(query_raw);
    let candidates: Vec<&MockRoute> = routes
        .iter()
        .filter(|route| {
            route.method.eq_ignore_ascii_case(&method)
                && paths_equal(&route.path, path)
        })
        .collect();
    if candidates.is_empty() {
        return None;
    }
    if let Some(name) = query.get("example") {
        if let Some(hit) = candidates.iter().find(|route| example_matches(route, name)) {
            return Some(*hit);
        }
    }
    if let Some(status) = query.get("status").and_then(|value| value.parse::<u16>().ok()) {
        if let Some(hit) = candidates.iter().find(|route| route.status == status) {
            return Some(*hit);
        }
    }
    candidates
        .iter()
        .copied()
        .find(|route| (200..300).contains(&route.status))
        .or_else(|| candidates.first().copied())
}

fn example_matches(route: &MockRoute, wanted: &str) -> bool {
    let want = slug(wanted);
    slug(&route.example_name) == want || route.example_name.eq_ignore_ascii_case(wanted)
}

fn slug(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn paths_equal(left: &str, right: &str) -> bool {
    left.trim_end_matches('/') == right.trim_end_matches('/')
}

fn parse_query(raw: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for pair in raw.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        out.insert(decode(key).to_ascii_lowercase(), decode(value));
    }
    out
}

fn decode(value: &str) -> String {
    percent_decode(value).unwrap_or_else(|| value.replace('+', " "))
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                index += 3;
            }
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

fn reason_phrase(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        422 => "Unprocessable Entity",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ if (200..300).contains(&status) => "OK",
        _ if (400..500).contains(&status) => "Error",
        _ => "Error",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn route(method: &str, path: &str, status: u16, name: &str, body: &str) -> MockRoute {
        MockRoute {
            method: method.into(),
            path: path.into(),
            status,
            body: body.into(),
            content_type: "application/json".into(),
            headers: vec![MockHeader {
                key: "X-Pulse-Hidden".into(),
                value: "nope".into(),
            }],
            example_name: name.into(),
        }
    }

    #[tokio::test]
    async fn serves_configured_route() {
        let server = start_mock_server_on(
            vec![route("GET", "/pets", 200, "ok", "{\"ok\":true}")],
            Some(0),
            0,
        )
        .await
        .unwrap();
        let url = format!("{}/pets", server.handle.url);
        let response = reqwest::get(&url).await.unwrap();
        assert_eq!(response.status().as_u16(), 200);
        assert!(response.headers().get("x-pulse-hidden").is_none());
        assert!(response.headers().get("server").is_none());
        assert_eq!(response.text().await.unwrap(), "{\"ok\":true}");
    }

    #[tokio::test]
    async fn picks_example_by_query() {
        let server = start_mock_server_on(
            vec![
                route("GET", "/pets", 200, "ok", "{\"ok\":true}"),
                route("GET", "/pets", 404, "missing", "{\"error\":\"gone\"}"),
            ],
            Some(0),
            0,
        )
        .await
        .unwrap();
        let missing = format!("{}/pets?example=missing", server.handle.url);
        let response = reqwest::get(&missing).await.unwrap();
        assert_eq!(response.status().as_u16(), 404);
        assert_eq!(response.text().await.unwrap(), "{\"error\":\"gone\"}");
        let by_status = format!("{}/pets?status=404", server.handle.url);
        let response = reqwest::get(&by_status).await.unwrap();
        assert_eq!(response.status().as_u16(), 404);
    }

    #[tokio::test]
    async fn omits_invented_headers() {
        let mut blank = route("GET", "/blank", 200, "ok", "raw");
        blank.content_type = String::new();
        blank.headers.clear();
        let server = start_mock_server_on(vec![blank], Some(0), 0).await.unwrap();
        let url = format!("{}/blank", server.handle.url);
        let response = reqwest::get(&url).await.unwrap();
        assert!(response.headers().get("content-type").is_none());
        assert!(response.headers().get("date").is_none());
        assert!(response.headers().get("server").is_none());
        assert!(response.headers().get("connection").is_none());
    }

    #[tokio::test]
    async fn refuses_busy_lock_port() {
        let first = start_mock_server_on(vec![], Some(0), 0).await.unwrap();
        let port = first.handle.port;
        let error = match start_mock_server_on(vec![], Some(port), 0).await {
            Ok(_) => panic!("expected the lock to fail"),
            Err(error) => error,
        };
        assert!(error.contains("Could not lock"), "{error}");
    }

    #[tokio::test]
    async fn applies_query_delay() {
        let server = start_mock_server_on(
            vec![route("GET", "/slow", 200, "ok", "ok")],
            Some(0),
            0,
        )
        .await
        .unwrap();
        let url = format!("{}/slow?delay=80", server.handle.url);
        let started = Instant::now();
        let response = reqwest::get(&url).await.unwrap();
        assert_eq!(response.status().as_u16(), 200);
        assert!(started.elapsed().as_millis() >= 70, "{:?}", started.elapsed());
    }
}
