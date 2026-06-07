use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart::{Form, Part};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::time::Instant;

use crate::cache::{cache_key, should_store_in_cache, should_use_cache, ResponseCache};
use crate::state::HttpState;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartField {
    pub key: String,
    pub enabled: bool,
    pub field_type: String,
    pub value: String,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    pub auth_type: String,
    pub bearer_token: Option<String>,
    pub basic_username: Option<String>,
    pub basic_password: Option<String>,
    pub api_key_key: Option<String>,
    pub api_key_value: Option<String>,
    pub api_key_in: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub query: Vec<KeyValue>,
    pub body_kind: String,
    pub body: String,
    pub form: Vec<KeyValue>,
    pub multipart: Vec<MultipartField>,
    pub auth: AuthConfig,
    #[serde(default)]
    pub use_cache: Option<bool>,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchItemResult {
    pub response: Option<HttpResponsePayload>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<ResponseHeader>,
    pub body: String,
    pub elapsed_ms: u64,
    pub size_bytes: usize,
    pub content_type: Option<String>,
    pub from_cache: bool,
    pub cache_age_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

fn enabled_pairs(items: &[KeyValue]) -> Vec<(String, String)> {
    items
        .iter()
        .filter(|item| item.enabled && !item.key.trim().is_empty())
        .map(|item| (item.key.trim().to_string(), item.value.clone()))
        .collect()
}

fn apply_auth(headers: &mut HeaderMap, auth: &AuthConfig) -> Result<(), String> {
    match auth.auth_type.as_str() {
        "none" => Ok(()),
        "bearer" => {
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
            let encoded = base64::engine::general_purpose::STANDARD
                .encode(format!("{username}:{password}"));
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
            if key.is_empty() {
                return Ok(());
            }
            match auth.api_key_in.as_deref().unwrap_or("header") {
                "query" => Ok(()),
                _ => {
                    headers.insert(
                        HeaderName::from_str(key)
                            .map_err(|e| format!("Invalid API key header name: {e}"))?,
                        HeaderValue::from_str(value)
                            .map_err(|e| format!("Invalid API key value: {e}"))?,
                    );
                    Ok(())
                }
            }
        }
        other => Err(format!("Unsupported auth type: {other}")),
    }
}

fn build_url(payload: &HttpRequestPayload) -> Result<reqwest::Url, String> {
    let mut url =
        reqwest::Url::parse(payload.url.trim()).map_err(|e| format!("Invalid URL: {e}"))?;

    if payload.auth.auth_type == "apiKey"
        && payload.auth.api_key_in.as_deref() == Some("query")
    {
        let key = payload.auth.api_key_key.as_deref().unwrap_or("").trim();
        let value = payload.auth.api_key_value.as_deref().unwrap_or("");
        if !key.is_empty() {
            url.query_pairs_mut().append_pair(key, value);
        }
    }

    for (key, value) in enabled_pairs(&payload.query) {
        url.query_pairs_mut().append_pair(&key, &value);
    }

    Ok(url)
}

pub async fn execute_request(
    state: &HttpState,
    payload: HttpRequestPayload,
) -> Result<HttpResponsePayload, String> {
    if should_use_cache(&payload) {
        let key = cache_key(&payload);
        if let Some(cached) = state.cache().get_response(&key) {
            return Ok(HttpResponsePayload {
                request_id: payload.request_id.clone(),
                ..cached
            });
        }
    }

    let _permit = state.engine().acquire().await?;
    state.engine().begin_request();

    let timeout_ms = payload
        .timeout_ms
        .unwrap_or_else(|| state.engine().default_timeout_ms());
    let request_id = payload.request_id.clone();

    let client = state.client().clone();
    let payload_for_task = payload.clone();

    let join_handle = tokio::spawn(async move {
        tokio::time::timeout(
            Duration::from_millis(timeout_ms),
            perform_request(&client, payload_for_task),
        )
        .await
    });

    if let Some(id) = request_id.as_ref() {
        state.engine().register_abort(id.clone(), join_handle.abort_handle());
    }

    let result = join_handle.await;
    if let Some(id) = request_id.as_ref() {
        state.engine().unregister_abort(id);
    }

    let response = match result {
        Ok(Ok(Ok(response))) => {
            state.engine().finish_request(true);
            response
        }
        Ok(Ok(Err(error))) => {
            state.engine().finish_request(false);
            return Err(error);
        }
        Ok(Err(_elapsed)) => {
            state.engine().finish_request(false);
            return Err(format!("Request timed out after {timeout_ms} ms"));
        }
        Err(error) => {
            state.engine().finish_request(false);
            if error.is_cancelled() {
                return Err("Request was cancelled".to_string());
            }
            return Err(format!("Request task failed: {error}"));
        }
    };

    if should_store_in_cache(&payload, &response) {
        state
            .cache()
            .insert(cache_key(&payload), response.clone());
    }

    Ok(HttpResponsePayload {
        request_id: payload.request_id,
        ..response
    })
}

pub async fn execute_requests_batch(
    state: &HttpState,
    payloads: Vec<HttpRequestPayload>,
) -> Vec<BatchItemResult> {
    let mut join_set = tokio::task::JoinSet::new();

    for payload in payloads {
        let state = state.clone();
        join_set.spawn(async move { execute_request(&state, payload).await });
    }

    let mut results = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(response)) => results.push(BatchItemResult {
                response: Some(response),
                error: None,
            }),
            Ok(Err(error)) => results.push(BatchItemResult {
                response: None,
                error: Some(error),
            }),
            Err(error) => results.push(BatchItemResult {
                response: None,
                error: Some(format!("Batch task failed: {error}")),
            }),
        }
    }

    results
}

pub fn cancel_request(state: &HttpState, request_id: &str) -> bool {
    state.engine().cancel(request_id)
}

pub fn cancel_all_requests(state: &HttpState) -> u64 {
    state.engine().cancel_all()
}

pub fn engine_stats(state: &HttpState) -> crate::engine::HttpEngineStats {
    state.engine().stats(cache_size(state.cache()))
}

async fn perform_request(
    client: &reqwest::Client,
    payload: HttpRequestPayload,
) -> Result<HttpResponsePayload, String> {
    let method = Method::from_str(payload.method.trim().to_uppercase().as_str())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;
    let url = build_url(&payload)?;

    let mut headers = HeaderMap::new();
    for (key, value) in enabled_pairs(&payload.headers) {
        let name =
            HeaderName::from_str(&key).map_err(|e| format!("Invalid header name `{key}`: {e}"))?;
        let val = HeaderValue::from_str(&value)
            .map_err(|e| format!("Invalid header value for `{key}`: {e}"))?;
        headers.insert(name, val);
    }
    apply_auth(&mut headers, &payload.auth)?;

    let mut request = client.request(method, url).headers(headers);

    request = match payload.body_kind.as_str() {
        "none" => request,
        "json" => {
            if payload.body.trim().is_empty() {
                request
            } else {
                let _: serde_json::Value = serde_json::from_str(&payload.body)
                    .map_err(|e| format!("Invalid JSON body: {e}"))?;
                request
                    .header("content-type", "application/json")
                    .body(payload.body.clone())
            }
        }
        "graphql" => {
            let parsed: serde_json::Value = serde_json::from_str(&payload.body)
                .map_err(|e| format!("Invalid GraphQL JSON body: {e}"))?;

            let query = parsed
                .get("query")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "GraphQL request requires a non-empty query field".to_string())?;

            if let Some(variables) = parsed.get("variables") {
                if !variables.is_null() && !variables.is_object() {
                    return Err("GraphQL variables must be a JSON object".to_string());
                }
            }

            if let Some(operation_name) = parsed.get("operationName") {
                if !operation_name.is_string() {
                    return Err("GraphQL operationName must be a string".to_string());
                }
            }

            let _ = query;
            request
                .header("content-type", "application/json")
                .body(payload.body.clone())
        }
        "raw" => {
            if payload.body.is_empty() {
                request
            } else {
                request.body(payload.body.clone())
            }
        }
        "form" => {
            let pairs = enabled_pairs(&payload.form);
            if pairs.is_empty() {
                request
            } else {
                request.form(&pairs)
            }
        }
        "multipart" => {
            let mut form = Form::new();
            for field in payload
                .multipart
                .iter()
                .filter(|f| f.enabled && !f.key.trim().is_empty())
            {
                if field.field_type == "file" {
                    let bytes = base64::engine::general_purpose::STANDARD
                        .decode(field.value.as_bytes())
                        .map_err(|e| format!("Invalid base64 for `{}`: {e}", field.key))?;
                    let file_name = field
                        .file_name
                        .clone()
                        .unwrap_or_else(|| "file.bin".to_string());
                    let mut part = Part::bytes(bytes).file_name(file_name);
                    if let Some(mime) = field.mime_type.as_ref() {
                        part = part
                            .mime_str(mime)
                            .map_err(|e| format!("Invalid mime type for `{}`: {e}", field.key))?;
                    }
                    form = form.part(field.key.clone(), part);
                } else {
                    form = form.text(field.key.clone(), field.value.clone());
                }
            }
            request.multipart(form)
        }
        other => return Err(format!("Unsupported body type: {other}")),
    };

    let started = Instant::now();
    let response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("Unknown")
        .to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let response_headers = response
        .headers()
        .iter()
        .map(|(name, value)| ResponseHeader {
            key: name.to_string(),
            value: value.to_str().unwrap_or("").to_string(),
        })
        .collect::<Vec<_>>();

    let body_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;
    let size_bytes = body_bytes.len();
    let body = String::from_utf8_lossy(&body_bytes).into_owned();

    Ok(HttpResponsePayload {
        status,
        status_text,
        headers: response_headers,
        body,
        elapsed_ms,
        size_bytes,
        content_type,
        from_cache: false,
        cache_age_ms: None,
        request_id: payload.request_id,
    })
}

pub fn clear_cache(cache: &ResponseCache) -> u64 {
    let remaining = cache.len();
    cache.clear();
    remaining
}

pub fn cache_size(cache: &ResponseCache) -> u64 {
    cache.len()
}
