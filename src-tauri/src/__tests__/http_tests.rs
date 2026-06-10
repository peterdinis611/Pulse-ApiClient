use super::*;
use reqwest::header::{AUTHORIZATION, HeaderValue};

fn sample_auth(auth_type: &str) -> AuthConfig {
    AuthConfig {
        auth_type: auth_type.to_string(),
        bearer_token: Some("secret-token".to_string()),
        basic_username: Some("user".to_string()),
        basic_password: Some("pass".to_string()),
        api_key_key: Some("X-Api-Key".to_string()),
        api_key_value: Some("key-value".to_string()),
        api_key_in: Some("header".to_string()),
    }
}

fn sample_payload(method: &str, url: &str, auth: AuthConfig) -> HttpRequestPayload {
    HttpRequestPayload {
        method: method.to_string(),
        url: url.to_string(),
        headers: vec![KeyValue {
            key: "X-Custom".to_string(),
            value: "1".to_string(),
            enabled: true,
        }],
        query: vec![KeyValue {
            key: "q".to_string(),
            value: "pulse".to_string(),
            enabled: true,
        }],
        body_kind: "none".to_string(),
        body: String::new(),
        form: vec![],
        multipart: vec![],
        auth,
        use_cache: None,
        request_id: None,
        timeout_ms: None,
    }
}

#[test]
fn build_request_url_appends_query_params() {
    let payload = sample_payload("GET", "https://example.com/search", sample_auth("none"));
    let url = build_request_url(&payload).expect("url should parse");
    assert!(url.as_str().contains("q=pulse"));
}

#[test]
fn build_request_url_adds_api_key_query_param() {
    let mut auth = sample_auth("apiKey");
    auth.api_key_in = Some("query".to_string());
    let payload = sample_payload("GET", "https://example.com/items", auth);
    let url = build_request_url(&payload).expect("url should parse");
    assert!(url.as_str().contains("X-Api-Key=key-value"));
}

#[test]
fn build_request_headers_adds_bearer_authorization() {
    let payload = sample_payload("GET", "https://example.com", sample_auth("bearer"));
    let headers = build_request_headers(&payload).expect("headers should build");
    assert_eq!(
        headers.get(AUTHORIZATION),
        Some(&HeaderValue::from_static("Bearer secret-token"))
    );
}

#[test]
fn build_request_headers_adds_basic_authorization() {
    let payload = sample_payload("GET", "https://example.com", sample_auth("basic"));
    let headers = build_request_headers(&payload).expect("headers should build");
    let value = headers.get(AUTHORIZATION).expect("authorization header");
    assert!(value.to_str().unwrap().starts_with("Basic "));
}

#[test]
fn build_request_headers_adds_api_key_header() {
    let payload = sample_payload("GET", "https://example.com", sample_auth("apiKey"));
    let headers = build_request_headers(&payload).expect("headers should build");
    assert_eq!(
        headers.get("X-Api-Key"),
        Some(&HeaderValue::from_static("key-value"))
    );
}

#[test]
fn enabled_pairs_skips_disabled_and_blank_keys() {
    let pairs = enabled_pairs(&[
        KeyValue {
            key: "Enabled".to_string(),
            value: "yes".to_string(),
            enabled: true,
        },
        KeyValue {
            key: " ".to_string(),
            value: "no".to_string(),
            enabled: true,
        },
        KeyValue {
            key: "Disabled".to_string(),
            value: "no".to_string(),
            enabled: false,
        },
    ]);

    assert_eq!(pairs, vec![("Enabled".to_string(), "yes".to_string())]);
}
