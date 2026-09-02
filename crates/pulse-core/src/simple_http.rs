use std::str::FromStr;
use std::time::Instant;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart::{Form, Part};
use reqwest::Method;

use crate::types::{enabled_pairs, AuthConfig, HttpRequestPayload, HttpResponsePayload, ResponseHeader};

fn apply_auth(headers: &mut HeaderMap, auth: &AuthConfig) -> Result<(), String> {
    match auth.auth_type.as_str() {
        "none" | "inherit" | "" => Ok(()),
        "bearer" | "oauth2" => {
            let token = auth.bearer_token.as_deref().unwrap_or("").trim();
            if token.is_empty() {
                return Ok(());
            }
            headers.insert(
                HeaderName::from_static("authorization"),
                HeaderValue::from_str(&format!("Bearer {token}"))
                    .map_err(|e| format!("Invalid bearer token: {e}"))?,
            );
            Ok(())
        }
        "basic" => {
            let username = auth.basic_username.as_deref().unwrap_or("");
            let password = auth.basic_password.as_deref().unwrap_or("");
            let encoded = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{username}:{password}"),
            );
            headers.insert(
                HeaderName::from_static("authorization"),
                HeaderValue::from_str(&format!("Basic {encoded}"))
                    .map_err(|e| format!("Invalid basic auth: {e}"))?,
            );
            Ok(())
        }
        "apiKey" => {
            let key = auth.api_key_key.as_deref().unwrap_or("").trim();
            let value = auth.api_key_value.as_deref().unwrap_or("");
            if key.is_empty() || auth.api_key_in.as_deref() == Some("query") {
                return Ok(());
            }
            headers.insert(
                HeaderName::from_str(key).map_err(|e| format!("Invalid API key header name: {e}"))?,
                HeaderValue::from_str(value).map_err(|e| format!("Invalid API key value: {e}"))?,
            );
            Ok(())
        }
        other => Err(format!("Unsupported auth type: {other}")),
    }
}

pub async fn send_once(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| e.to_string())?;
    send_with_client(&client, payload).await
}

pub async fn send_with_client(
    client: &reqwest::Client,
    payload: HttpRequestPayload,
) -> Result<HttpResponsePayload, String> {
    let method = Method::from_bytes(payload.method.trim().to_uppercase().as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;
    let mut url = reqwest::Url::parse(payload.url.trim()).map_err(|e| format!("Invalid URL: {e}"))?;
    if payload.auth.auth_type == "apiKey" && payload.auth.api_key_in.as_deref() == Some("query") {
        if let (Some(key), Some(value)) = (
            payload.auth.api_key_key.as_deref().map(str::trim).filter(|k| !k.is_empty()),
            payload.auth.api_key_value.as_deref(),
        ) {
            url.query_pairs_mut().append_pair(key, value);
        }
    }
    for (key, value) in enabled_pairs(&payload.query) {
        url.query_pairs_mut().append_pair(&key, &value);
    }

    let mut headers = HeaderMap::new();
    for (key, value) in enabled_pairs(&payload.headers) {
        headers.insert(
            HeaderName::from_str(&key).map_err(|e| format!("Invalid header name `{key}`: {e}"))?,
            HeaderValue::from_str(&value).map_err(|e| format!("Invalid header value for `{key}`: {e}"))?,
        );
    }
    apply_auth(&mut headers, &payload.auth)?;

    let mut request = client.request(method, url).headers(headers);
    request = match payload.body_kind.as_str() {
        "none" | "" => request,
        "json" | "graphql" | "raw" => {
            if payload.body.is_empty() {
                request
            } else {
                if payload.body_kind == "json" || payload.body_kind == "graphql" {
                    request = request.header("content-type", "application/json");
                }
                request.body(payload.body.clone())
            }
        }
        "form" => request.form(&enabled_pairs(&payload.form)),
        "multipart" => {
            let mut form = Form::new();
            for field in payload.multipart.iter().filter(|f| f.enabled && !f.key.trim().is_empty()) {
                if field.field_type == "file" {
                    let bytes = base64::Engine::decode(
                        &base64::engine::general_purpose::STANDARD,
                        field.value.as_bytes(),
                    )
                    .map_err(|e| format!("Invalid base64 for `{}`: {e}", field.key))?;
                    form = form.part(
                        field.key.clone(),
                        Part::bytes(bytes).file_name(field.file_name.clone().unwrap_or_else(|| "file.bin".into())),
                    );
                } else {
                    form = form.text(field.key.clone(), field.value.clone());
                }
            }
            request.multipart(form)
        }
        other => return Err(format!("Unsupported body type: {other}")),
    };

    let started = Instant::now();
    let response = request.send().await.map_err(|e| format!("Request failed: {e}"))?;
    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("Unknown").to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let response_headers = response
        .headers()
        .iter()
        .map(|(name, value)| ResponseHeader {
            key: name.to_string(),
            value: value.to_str().unwrap_or("").to_string(),
        })
        .collect();
    let body_bytes = response.bytes().await.map_err(|e| format!("Failed to read response body: {e}"))?;
    let total_ms = started.elapsed().as_millis() as u64;
    let body = String::from_utf8_lossy(&body_bytes).into_owned();
    Ok(HttpResponsePayload {
        status,
        status_text,
        headers: response_headers,
        body,
        body_encoding: "utf8".into(),
        elapsed_ms: total_ms,
        dns_ms: None,
        tls_ms: None,
        ttfb_ms: None,
        download_ms: None,
        total_ms: Some(total_ms),
        size_bytes: body_bytes.len(),
        content_type,
        from_cache: false,
        cache_age_ms: None,
        request_id: payload.request_id,
    })
}
