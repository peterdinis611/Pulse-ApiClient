//! Code snippets from an HttpRequestPayload — mirrors `python/pulse/snippet.py`.

use crate::curl::payload_to_curl;
use crate::types::{HttpRequestPayload, KeyValue};
use serde_json::{json, Value};

fn enabled(rows: &[KeyValue]) -> Vec<(String, String)> {
    rows.iter()
        .filter(|row| row.enabled && !row.key.trim().is_empty())
        .map(|row| (row.key.trim().to_string(), row.value.clone()))
        .collect()
}

fn with_auth_headers(payload: &HttpRequestPayload) -> Vec<(String, String)> {
    let mut headers = enabled(&payload.headers);
    let has_auth = headers
        .iter()
        .any(|(key, _)| key.eq_ignore_ascii_case("authorization"));
    match payload.auth.auth_type.as_str() {
        "bearer" => {
            if let Some(token) = payload
                .auth
                .bearer_token
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                if !has_auth {
                    headers.push(("Authorization".into(), format!("Bearer {token}")));
                }
            }
        }
        "basic" => {
            if !has_auth {
                let user = payload.auth.basic_username.as_deref().unwrap_or("");
                let pass = payload.auth.basic_password.as_deref().unwrap_or("");
                let token = base64_encode(&format!("{user}:{pass}"));
                headers.push(("Authorization".into(), format!("Basic {token}")));
            }
        }
        "apiKey" => {
            if payload.auth.api_key_in.as_deref() != Some("query") {
                if let Some(key) = payload
                    .auth
                    .api_key_key
                    .as_deref()
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                {
                    let value = payload.auth.api_key_value.clone().unwrap_or_default();
                    if !headers
                        .iter()
                        .any(|(existing, _)| existing.eq_ignore_ascii_case(key))
                    {
                        headers.push((key.to_string(), value));
                    }
                }
            }
        }
        _ => {}
    }
    if matches!(payload.body_kind.as_str(), "json" | "graphql")
        && !headers
            .iter()
            .any(|(key, _)| key.eq_ignore_ascii_case("content-type"))
    {
        headers.push(("Content-Type".into(), "application/json".into()));
    }
    headers
}

fn body_text(payload: &HttpRequestPayload) -> Option<String> {
    if matches!(payload.body_kind.as_str(), "json" | "raw" | "graphql") {
        let trimmed = payload.body.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(payload.body.clone())
        }
    } else if payload.body_kind == "form" {
        let fields: Vec<_> = enabled(&payload.form);
        if fields.is_empty() {
            None
        } else {
            Some(
                fields
                    .into_iter()
                    .map(|(k, v)| {
                        format!(
                            "{}={}",
                            urlencoding_encode(&k),
                            urlencoding_encode(&v)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("&"),
            )
        }
    } else {
        None
    }
}

fn base64_encode(input: &str) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = input.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let b0 = bytes[i] as u32;
        let b1 = if i + 1 < bytes.len() {
            bytes[i + 1] as u32
        } else {
            0
        };
        let b2 = if i + 2 < bytes.len() {
            bytes[i + 2] as u32
        } else {
            0
        };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        out.push(if i + 1 < bytes.len() {
            TABLE[((triple >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if i + 2 < bytes.len() {
            TABLE[(triple & 63) as usize] as char
        } else {
            '='
        });
        i += 3;
    }
    out
}

fn urlencoding_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn js_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| format!("{:?}", value))
}

pub fn to_curl(payload: &HttpRequestPayload) -> String {
    payload_to_curl(payload)
}

pub fn to_fetch(payload: &HttpRequestPayload) -> String {
    let headers: Value = with_auth_headers(payload)
        .into_iter()
        .map(|(k, v)| (k, Value::String(v)))
        .collect::<serde_json::Map<_, _>>()
        .into();
    let mut init = json!({ "method": payload.method.to_uppercase() });
    if let Some(obj) = init.as_object_mut() {
        if !headers.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            obj.insert("headers".into(), headers);
        }
        if let Some(body) = body_text(payload) {
            obj.insert("body".into(), Value::String(body));
        }
    }
    format!(
        "fetch({}, {})",
        js_string(&payload.url),
        serde_json::to_string_pretty(&init).unwrap_or_else(|_| "{}".into())
    )
}

pub fn to_httpie(payload: &HttpRequestPayload) -> String {
    let mut parts = vec![
        "http".to_string(),
        payload.method.to_uppercase(),
        payload.url.clone(),
    ];
    for (key, value) in with_auth_headers(payload) {
        parts.push(format!("{key}:{value}"));
    }
    if let Some(body) = body_text(payload) {
        parts.push("<<<".into());
        parts.push(body);
    }
    shell_join(&parts)
}

pub fn to_python(payload: &HttpRequestPayload) -> String {
    let method = payload.method.to_lowercase();
    let headers: serde_json::Map<String, Value> = with_auth_headers(payload)
        .into_iter()
        .map(|(k, v)| (k, Value::String(v)))
        .collect();
    let mut lines = vec!["import requests".into(), String::new()];
    let mut kwargs = vec![js_string(&payload.url)];
    if !headers.is_empty() {
        lines.push(format!(
            "headers = {}",
            serde_json::to_string_pretty(&headers).unwrap_or_else(|_| "{}".into())
        ));
        kwargs.push("headers=headers".into());
    }
    if let Some(body) = body_text(payload) {
        if payload.body_kind == "json" {
            if let Ok(parsed) = serde_json::from_str::<Value>(&body) {
                lines.push(format!(
                    "payload = {}",
                    serde_json::to_string_pretty(&parsed).unwrap_or(body.clone())
                ));
                kwargs.push("json=payload".into());
            } else {
                lines.push(format!("data = {}", js_string(&body)));
                kwargs.push("data=data".into());
            }
        } else {
            lines.push(format!("data = {}", js_string(&body)));
            kwargs.push("data=data".into());
        }
    }
    if payload.auth.auth_type == "basic" {
        let user = payload.auth.basic_username.as_deref().unwrap_or("");
        let pass = payload.auth.basic_password.as_deref().unwrap_or("");
        kwargs.push(format!("auth=({}, {})", js_string(user), js_string(pass)));
    }
    lines.push(format!(
        "response = requests.{method}({})",
        kwargs.join(", ")
    ));
    lines.push("print(response.status_code)".into());
    lines.push("print(response.text)".into());
    lines.join("\n")
}

pub fn to_axios(payload: &HttpRequestPayload) -> String {
    let headers: Value = with_auth_headers(payload)
        .into_iter()
        .map(|(k, v)| (k, Value::String(v)))
        .collect::<serde_json::Map<_, _>>()
        .into();
    let mut config = json!({
        "method": payload.method.to_lowercase(),
        "url": payload.url,
    });
    if let Some(obj) = config.as_object_mut() {
        if !headers.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            obj.insert("headers".into(), headers);
        }
        if let Some(body) = body_text(payload) {
            if payload.body_kind == "json" {
                if let Ok(parsed) = serde_json::from_str::<Value>(&body) {
                    obj.insert("data".into(), parsed);
                } else {
                    obj.insert("data".into(), Value::String(body));
                }
            } else {
                obj.insert("data".into(), Value::String(body));
            }
        }
    }
    format!(
        "await axios({})",
        serde_json::to_string_pretty(&config).unwrap_or_else(|_| "{}".into())
    )
}

pub fn to_okhttp(payload: &HttpRequestPayload) -> String {
    let method = payload.method.to_uppercase();
    let mut lines = vec![
        "OkHttpClient client = new OkHttpClient();".into(),
        String::new(),
    ];
    let has_body = body_text(payload).is_some() && !matches!(method.as_str(), "GET" | "HEAD");
    if has_body {
        let media = if payload.body_kind == "json" {
            "application/json"
        } else {
            "text/plain"
        };
        let body = body_text(payload).unwrap_or_default();
        lines.push(format!(
            "RequestBody body = RequestBody.create({}, MediaType.parse({}));",
            js_string(&body),
            js_string(media)
        ));
    }
    lines.push("Request.Builder builder = new Request.Builder()".into());
    lines.push(format!("    .url({})", js_string(&payload.url)));
    let body_arg = if has_body { "body" } else { "null" };
    lines.push(format!("    .method({}, {});", js_string(&method), body_arg));
    for (key, value) in with_auth_headers(payload) {
        lines.push(format!(
            "builder.addHeader({}, {});",
            js_string(&key),
            js_string(&value)
        ));
    }
    lines.extend([
        "Request request = builder.build();".into(),
        "try (Response response = client.newCall(request).execute()) {".into(),
        "    System.out.println(response.code());".into(),
        "    System.out.println(response.body() != null ? response.body().string() : \"\");".into(),
        "}".into(),
    ]);
    lines.join("\n")
}

pub fn to_reqwest(payload: &HttpRequestPayload) -> String {
    let method = payload.method.to_uppercase();
    let mut lines = vec![
        "use reqwest::header::{HeaderMap, HeaderName, HeaderValue};".into(),
        String::new(),
        "#[tokio::main]".into(),
        "async fn main() -> Result<(), Box<dyn std::error::Error>> {".into(),
        "    let client = reqwest::Client::new();".into(),
        "    let mut headers = HeaderMap::new();".into(),
    ];
    for (key, value) in with_auth_headers(payload) {
        lines.push(format!(
            "    headers.insert(HeaderName::from_bytes({}.as_bytes())?, HeaderValue::from_str({})?);",
            js_string(&key),
            js_string(&value)
        ));
    }
    lines.push(format!(
        "    let mut builder = client.request(reqwest::Method::from_bytes({}.as_bytes())?, {});",
        js_string(&method),
        js_string(&payload.url)
    ));
    lines.push("    builder = builder.headers(headers);".into());
    if let Some(body) = body_text(payload) {
        if !matches!(method.as_str(), "GET" | "HEAD") {
            lines.push(format!(
                "    builder = builder.body({}.to_string());",
                js_string(&body)
            ));
        }
    }
    lines.extend([
        "    let response = builder.send().await?;".into(),
        "    println!(\"{}\", response.status());".into(),
        "    println!(\"{}\", response.text().await?);".into(),
        "    Ok(())".into(),
        "}".into(),
    ]);
    lines.join("\n")
}

pub fn to_swift(payload: &HttpRequestPayload) -> String {
    let method = payload.method.to_uppercase();
    let mut lines = vec![
        "import Foundation".into(),
        String::new(),
        format!(
            "var request = URLRequest(url: URL(string: {})!)",
            js_string(&payload.url)
        ),
        format!("request.httpMethod = {}", js_string(&method)),
    ];
    for (key, value) in with_auth_headers(payload) {
        lines.push(format!(
            "request.setValue({}, forHTTPHeaderField: {})",
            js_string(&value),
            js_string(&key)
        ));
    }
    if let Some(body) = body_text(payload) {
        if !matches!(method.as_str(), "GET" | "HEAD") {
            lines.push(format!(
                "request.httpBody = {}.data(using: .utf8)",
                js_string(&body)
            ));
        }
    }
    lines.extend([
        "let task = URLSession.shared.dataTask(with: request) { data, response, error in".into(),
        "    if let error = error { print(error); return }".into(),
        "    if let http = response as? HTTPURLResponse { print(http.statusCode) }".into(),
        "    if let data = data, let text = String(data: data, encoding: .utf8) { print(text) }"
            .into(),
        "}".into(),
        "task.resume()".into(),
    ]);
    lines.join("\n")
}

pub fn generate(payload: &HttpRequestPayload, format: &str) -> Result<String, String> {
    match format {
        "curl" => Ok(to_curl(payload)),
        "fetch" => Ok(to_fetch(payload)),
        "httpie" => Ok(to_httpie(payload)),
        "python" => Ok(to_python(payload)),
        "axios" => Ok(to_axios(payload)),
        "okhttp" => Ok(to_okhttp(payload)),
        "reqwest" => Ok(to_reqwest(payload)),
        "swift" => Ok(to_swift(payload)),
        "all" => {
            let mut map = serde_json::Map::new();
            for name in [
                "curl", "fetch", "httpie", "python", "axios", "okhttp", "reqwest", "swift",
            ] {
                map.insert(name.into(), Value::String(generate(payload, name)?));
            }
            Ok(serde_json::to_string_pretty(&Value::Object(map)).unwrap_or_default())
        }
        other => Err(format!("unknown snippet format: {other}")),
    }
}

fn shell_join(parts: &[String]) -> String {
    parts
        .iter()
        .map(|part| {
            if part.is_empty() {
                "''".into()
            } else if part
                .bytes()
                .all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-' | b'.' | b'/' | b':' | b'?' | b'&' | b'=' | b'%' | b'@' | b',' | b'+' | b'~'))
            {
                part.clone()
            } else {
                format!("'{}'", part.replace('\'', "'\\''"))
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
