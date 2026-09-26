//! cURL import / export for the desktop engine.
//!
//! Supports common flags from Chrome DevTools, Postman, and HTTPie exports.

use crate::http::{AuthConfig, HttpRequestPayload, KeyValue, MultipartField};
use regex::Regex;
use std::sync::OnceLock;

fn flag_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?xi)
            (?P<bool>--compressed|--get|--head|-G|-I)
            |
            (?:(?P<flag>
                --data-urlencode|--data-binary|--data-raw|--data|--json|
                --request|--header|--user|--url|--user-agent|--referer|--cookie|
                --form|
                -X|-H|-d|-u|-A|-e|-b|-F
            )
            \s+(?:'(?P<sq>[^']*)'|"(?P<dq>[^"]*)"|(?P<bare>\S+)))
            "#,
        )
        .expect("curl flag regex")
    })
}

fn shell_escape(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    if Regex::new(r"^[A-Za-z0-9_./:?&=%@,+~-]+$")
        .expect("safe")
        .is_match(value)
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn kv(key: &str, value: &str) -> KeyValue {
    KeyValue {
        key: key.to_string(),
        value: value.to_string(),
        enabled: true,
    }
}

fn default_auth() -> AuthConfig {
    AuthConfig {
        auth_type: "none".to_string(),
        bearer_token: None,
        basic_username: None,
        basic_password: None,
        api_key_key: None,
        api_key_value: None,
        api_key_in: None,
    }
}

fn parse_form_field(raw: &str) -> MultipartField {
    // name=value | name=@path | name=value;type=mime
    let (key, rest) = raw.split_once('=').unwrap_or((raw, ""));
    let key = key.trim();
    if let Some(path) = rest.strip_prefix('@') {
        let (path, mime) = path
            .split_once(";type=")
            .map(|(p, m)| (p.trim(), Some(m.trim().to_string())))
            .unwrap_or((path.trim(), None));
        let file_name = std::path::Path::new(path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        return MultipartField {
            key: key.to_string(),
            enabled: true,
            field_type: "file".to_string(),
            value: String::new(),
            file_name: Some(file_name),
            mime_type: mime,
        };
    }
    MultipartField {
        key: key.to_string(),
        enabled: true,
        field_type: "text".to_string(),
        value: rest.to_string(),
        file_name: None,
        mime_type: None,
    }
}

/// Parse a cURL command into an [`HttpRequestPayload`].
pub fn curl_to_payload(raw: &str) -> Result<HttpRequestPayload, String> {
    let normalized = Regex::new(r"\\\s*\n")
        .expect("nl")
        .replace_all(raw, " ")
        .trim()
        .to_string();
    if !normalized.to_ascii_lowercase().contains("curl") {
        return Err("Input does not look like a cURL command".into());
    }

    let mut method = String::new();
    let mut headers: Vec<KeyValue> = Vec::new();
    let mut data_parts: Vec<String> = Vec::new();
    let mut urlencode_parts: Vec<KeyValue> = Vec::new();
    let mut multipart: Vec<MultipartField> = Vec::new();
    let mut auth = default_auth();
    let mut url = String::new();
    let mut force_get = false;
    let mut force_head = false;
    let mut is_json_flag = false;

    for caps in flag_re().captures_iter(&normalized) {
        if let Some(bool_flag) = caps.name("bool").map(|m| m.as_str().to_ascii_lowercase()) {
            match bool_flag.as_str() {
                "--compressed" => {}
                "-g" | "--get" => force_get = true,
                "-i" | "--head" => force_head = true,
                _ => {}
            }
            continue;
        }

        let flag = caps.name("flag").map(|m| m.as_str()).unwrap_or("").to_ascii_lowercase();
        let value = caps
            .name("sq")
            .or_else(|| caps.name("dq"))
            .or_else(|| caps.name("bare"))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();

        match flag.as_str() {
            "-x" | "--request" => method = value.to_ascii_uppercase(),
            "-h" | "--header" => {
                let (key, rest) = value.split_once(':').unwrap_or((value.as_str(), ""));
                headers.push(kv(key.trim(), rest.trim()));
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" => {
                if !value.is_empty() {
                    data_parts.push(value);
                }
            }
            "--data-urlencode" => {
                if value.is_empty() {
                    continue;
                }
                let (key, val) = value.split_once('=').unwrap_or((value.as_str(), ""));
                urlencode_parts.push(kv(key.trim(), val));
            }
            "--json" => {
                is_json_flag = true;
                if !value.is_empty() {
                    data_parts.push(value);
                }
                if !headers
                    .iter()
                    .any(|h| h.key.eq_ignore_ascii_case("content-type"))
                {
                    headers.push(kv("Content-Type", "application/json"));
                }
                if !headers.iter().any(|h| h.key.eq_ignore_ascii_case("accept")) {
                    headers.push(kv("Accept", "application/json"));
                }
            }
            "-f" | "--form" => {
                if !value.is_empty() {
                    multipart.push(parse_form_field(&value));
                }
            }
            "-u" | "--user" => {
                let (username, password) = value.split_once(':').unwrap_or((value.as_str(), ""));
                auth = AuthConfig {
                    auth_type: "basic".to_string(),
                    basic_username: Some(username.to_string()),
                    basic_password: Some(password.to_string()),
                    ..default_auth()
                };
            }
            "--url" => url = value,
            "-a" | "--user-agent" => headers.push(kv("User-Agent", &value)),
            "-e" | "--referer" => headers.push(kv("Referer", &value)),
            "-b" | "--cookie" => headers.push(kv("Cookie", &value)),
            _ => {}
        }
    }

    if url.is_empty() {
        if let Some(m) = Regex::new(r#"https?://[^\s'"]+"#)
            .expect("url")
            .find(&normalized)
        {
            url = m.as_str().to_string();
        } else {
            let quoted = Regex::new(r#"'([^']+)'|"([^"]+)""#)
                .expect("q")
                .captures_iter(&normalized)
                .filter_map(|c| c.get(1).or_else(|| c.get(2)).map(|m| m.as_str().to_string()))
                .collect::<Vec<_>>();
            url = quoted
                .into_iter()
                .rev()
                .find(|item| item.starts_with("http"))
                .unwrap_or_default();
        }
    }
    if url.is_empty() {
        return Err("Could not find URL in cURL command".into());
    }

    for header in &headers {
        if header.key.eq_ignore_ascii_case("authorization")
            && header.value.to_ascii_lowercase().starts_with("bearer ")
        {
            auth = AuthConfig {
                auth_type: "bearer".to_string(),
                bearer_token: Some(header.value[7..].trim().to_string()),
                ..default_auth()
            };
        }
    }

    let body_joined = data_parts.join("&");
    let has_body = !body_joined.is_empty() || !urlencode_parts.is_empty() || !multipart.is_empty();

    if method.is_empty() {
        method = if force_head {
            "HEAD".into()
        } else if force_get {
            "GET".into()
        } else if has_body {
            "POST".into()
        } else {
            "GET".into()
        };
    }
    if force_head {
        method = "HEAD".into();
    }
    if force_get && !body_joined.is_empty() {
        // -G moves data into the query string
        method = "GET".into();
    }

    let mut query = Vec::new();
    let mut form = urlencode_parts;
    let mut body = body_joined;
    let mut body_kind = "none".to_string();

    if force_get && !body.is_empty() {
        for part in body.split('&') {
            let (k, v) = part.split_once('=').unwrap_or((part, ""));
            query.push(kv(k, v));
        }
        body.clear();
    } else if !multipart.is_empty() {
        body_kind = "multipart".into();
    } else if !form.is_empty() && body.is_empty() {
        body_kind = "form".into();
    } else if !body.is_empty() {
        let trimmed = body.trim();
        body_kind = if is_json_flag || trimmed.starts_with('{') || trimmed.starts_with('[') {
            "json".into()
        } else if body.contains('=')
            && !trimmed.starts_with('{')
            && headers.iter().any(|h| {
                h.key.eq_ignore_ascii_case("content-type")
                    && h.value.to_ascii_lowercase().contains("x-www-form-urlencoded")
            })
        {
            for part in body.split('&') {
                let (k, v) = part.split_once('=').unwrap_or((part, ""));
                form.push(kv(
                    &urlencoding_decode(k),
                    &urlencoding_decode(v),
                ));
            }
            body.clear();
            "form".into()
        } else {
            "raw".into()
        };
    }

    // Strip Authorization header when folded into auth (avoid double-send on re-export)
    if auth.auth_type == "bearer" {
        headers.retain(|h| !h.key.eq_ignore_ascii_case("authorization"));
    }

    Ok(HttpRequestPayload {
        method,
        url,
        headers,
        query,
        body_kind,
        body,
        form,
        multipart,
        auth,
        use_cache: None,
        request_id: None,
        timeout_ms: None,
    })
}

fn urlencoding_decode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let bytes = value.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let (Some(a), Some(b)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                    out.push((a << 4 | b) as char);
                    i += 3;
                } else {
                    out.push(bytes[i] as char);
                    i += 1;
                }
            }
            c => {
                out.push(c as char);
                i += 1;
            }
        }
    }
    out
}

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Format an [`HttpRequestPayload`] as a single-line cURL command.
pub fn payload_to_curl(payload: &HttpRequestPayload) -> String {
    let mut parts: Vec<String> = vec!["curl".into()];
    let method = payload.method.trim().to_uppercase();
    if method != "GET" {
        parts.push("-X".into());
        parts.push(method.clone());
    }

    let mut header_keys = std::collections::HashSet::new();
    for header in payload.headers.iter().filter(|h| h.enabled && !h.key.trim().is_empty()) {
        let key = header.key.trim();
        header_keys.insert(key.to_ascii_lowercase());
        parts.push("-H".into());
        parts.push(shell_escape(&format!("{key}: {}", header.value)));
    }

    match payload.auth.auth_type.as_str() {
        "bearer" | "oauth2" => {
            if let Some(token) = payload.auth.bearer_token.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
                if !header_keys.contains("authorization") {
                    parts.push("-H".into());
                    parts.push(shell_escape(&format!("Authorization: Bearer {token}")));
                }
            }
        }
        "basic" => {
            let user = payload.auth.basic_username.as_deref().unwrap_or("");
            let pass = payload.auth.basic_password.as_deref().unwrap_or("");
            if !user.is_empty() || !pass.is_empty() {
                parts.push("-u".into());
                parts.push(shell_escape(&format!("{user}:{pass}")));
            }
        }
        "apiKey" => {
            let key = payload.auth.api_key_key.as_deref().unwrap_or("").trim();
            let value = payload.auth.api_key_value.as_deref().unwrap_or("");
            if !key.is_empty() && payload.auth.api_key_in.as_deref() != Some("query") {
                if !header_keys.contains(&key.to_ascii_lowercase()) {
                    parts.push("-H".into());
                    parts.push(shell_escape(&format!("{key}: {value}")));
                }
            }
        }
        _ => {}
    }

    let mut url = payload.url.trim().to_string();
    let query_enabled: Vec<_> = payload
        .query
        .iter()
        .filter(|q| q.enabled && !q.key.trim().is_empty())
        .collect();
    if !query_enabled.is_empty() {
        let qs = query_enabled
            .iter()
            .map(|q| format!("{}={}", encode_component(q.key.trim()), encode_component(&q.value)))
            .collect::<Vec<_>>()
            .join("&");
        if url.contains('?') {
            url.push('&');
            url.push_str(&qs);
        } else {
            url.push('?');
            url.push_str(&qs);
        }
    }

    match payload.body_kind.as_str() {
        "json" if !payload.body.trim().is_empty() => {
            if !header_keys.contains("content-type") {
                parts.push("-H".into());
                parts.push(shell_escape("Content-Type: application/json"));
            }
            parts.push("--data-raw".into());
            parts.push(shell_escape(&payload.body));
        }
        "raw" if !payload.body.is_empty() => {
            parts.push("--data-raw".into());
            parts.push(shell_escape(&payload.body));
        }
        "graphql" if !payload.body.trim().is_empty() => {
            if !header_keys.contains("content-type") {
                parts.push("-H".into());
                parts.push(shell_escape("Content-Type: application/json"));
            }
            parts.push("--data-raw".into());
            parts.push(shell_escape(&payload.body));
        }
        "form" => {
            for field in payload.form.iter().filter(|f| f.enabled && !f.key.trim().is_empty()) {
                parts.push("--data-urlencode".into());
                parts.push(shell_escape(&format!("{}={}", field.key.trim(), field.value)));
            }
        }
        "multipart" => {
            for field in payload
                .multipart
                .iter()
                .filter(|f| f.enabled && !f.key.trim().is_empty())
            {
                parts.push("-F".into());
                if field.field_type == "file" {
                    let name = field.file_name.as_deref().unwrap_or("file");
                    let mut value = format!("{}=@{name}", field.key.trim());
                    if let Some(mime) = field.mime_type.as_deref() {
                        value.push_str(";type=");
                        value.push_str(mime);
                    }
                    parts.push(shell_escape(&value));
                } else {
                    parts.push(shell_escape(&format!("{}={}", field.key.trim(), field.value)));
                }
            }
        }
        _ => {}
    }

    parts.push("--compressed".into());
    parts.push(shell_escape(&url));
    parts.join(" ")
}

fn encode_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
#[path = "__tests__/curl_tests.rs"]
mod tests;
