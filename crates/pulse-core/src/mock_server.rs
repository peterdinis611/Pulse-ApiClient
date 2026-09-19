//! Local HTTP mock from method/path → status/body (OpenAPI examples / saved responses).

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

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
}

fn default_status() -> u16 {
    200
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockServerHandle {
    pub url: String,
    pub port: u16,
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
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
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
                        let mut buf = vec![0u8; 8192];
                        let Ok(n) = stream.read(&mut buf).await else { return };
                        let request = String::from_utf8_lossy(&buf[..n]);
                        let (status, content_type, body) = match_route(&request, &routes);
                        let response = format!(
                            "HTTP/1.1 {status} OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                            body.len()
                        );
                        let _ = stream.write_all(response.as_bytes()).await;
                    });
                }
            }
        }
    });
    Ok(MockServer {
        shutdown: Some(tx),
        handle: MockServerHandle {
            url: format!("http://127.0.0.1:{port}"),
            port,
        },
    })
}

fn match_route(request: &str, routes: &[MockRoute]) -> (u16, String, String) {
    let first = request.lines().next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_uppercase();
    let path = parts.next().unwrap_or("/").split('?').next().unwrap_or("/");
    for route in routes {
        if route.method.eq_ignore_ascii_case(&method)
            && (route.path == path || route.path.trim_end_matches('/') == path.trim_end_matches('/'))
        {
            let content_type = if route.content_type.is_empty() {
                "application/json".into()
            } else {
                route.content_type.clone()
            };
            return (route.status, content_type, route.body.clone());
        }
    }
    (404, "application/json".into(), "{\"error\":\"not mocked\"}".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn serves_configured_route() {
        let server = start_mock_server(vec![MockRoute {
            method: "GET".into(),
            path: "/pets".into(),
            status: 200,
            body: "{\"ok\":true}".into(),
            content_type: "application/json".into(),
        }])
        .await
        .unwrap();
        let url = format!("{}/pets", server.handle.url);
        let body = reqwest::get(&url).await.unwrap().text().await.unwrap();
        assert_eq!(body, "{\"ok\":true}");
    }
}
