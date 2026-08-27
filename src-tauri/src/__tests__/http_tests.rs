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

#[test]
fn encode_response_body_keeps_utf8_text() {
    let (body, encoding) = encode_response_body(b"{\"ok\":true}", Some("application/json"));
    assert_eq!(encoding, "utf8");
    assert_eq!(body, "{\"ok\":true}");
}

#[test]
fn encode_response_body_base64_for_images() {
    use base64::Engine;
    let png_bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    let (body, encoding) = encode_response_body(&png_bytes, Some("image/png"));
    assert_eq!(encoding, "base64");
    assert_eq!(
        body,
        base64::engine::general_purpose::STANDARD.encode(png_bytes)
    );
}

#[test]
fn encode_response_body_base64_for_pdf_and_excel() {
    let bytes = b"%PDF-1.4 binary\x00\xff";
    let (pdf_body, pdf_enc) = encode_response_body(bytes, Some("application/pdf"));
    assert_eq!(pdf_enc, "base64");
    assert!(!pdf_body.is_empty());

    let (xlsx_body, xlsx_enc) = encode_response_body(
        bytes,
        Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    );
    assert_eq!(xlsx_enc, "base64");
    assert_eq!(xlsx_body, pdf_body);
}

#[test]
fn encode_response_body_base64_for_invalid_utf8() {
    use base64::Engine;
    let bytes = [0xff, 0xfe, 0xfd];
    let (body, encoding) = encode_response_body(&bytes, Some("text/plain"));
    assert_eq!(encoding, "base64");
    assert_eq!(
        body,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    );
}

#[test]
fn encode_response_body_keeps_csv_as_utf8() {
    let (body, encoding) = encode_response_body(b"a,b\n1,2\n", Some("text/csv; charset=utf-8"));
    assert_eq!(encoding, "utf8");
    assert_eq!(body, "a,b\n1,2\n");
}

#[test]
fn response_payload_serializes_timing_fields() {
    let payload = HttpResponsePayload {
        status: 200,
        status_text: "OK".to_string(),
        headers: vec![],
        body: "{}".to_string(),
        body_encoding: "utf8".to_string(),
        elapsed_ms: 800,
        dns_ms: Some(12),
        tls_ms: Some(48),
        ttfb_ms: Some(180),
        download_ms: Some(620),
        total_ms: Some(800),
        size_bytes: 2,
        content_type: Some("application/json".to_string()),
        from_cache: false,
        cache_age_ms: None,
        request_id: None,
    };
    let json = serde_json::to_value(&payload).expect("serialize");
    assert_eq!(json["elapsedMs"], 800);
    assert_eq!(json["dnsMs"], 12);
    assert_eq!(json["tlsMs"], 48);
    assert_eq!(json["ttfbMs"], 180);
    assert_eq!(json["downloadMs"], 620);
    assert_eq!(json["totalMs"], 800);
}

#[test]
fn response_payload_deserializes_without_timing_fields() {
    let parsed: HttpResponsePayload = serde_json::from_value(serde_json::json!({
        "status": 200,
        "statusText": "OK",
        "headers": [],
        "body": "{}",
        "elapsedMs": 42,
        "sizeBytes": 2,
        "fromCache": false,
        "contentType": null,
        "cacheAgeMs": null,
        "requestId": null
    }))
    .expect("legacy payload should deserialize");
    assert_eq!(parsed.elapsed_ms, 42);
    assert_eq!(parsed.body_encoding, "utf8");
    assert!(parsed.dns_ms.is_none());
    assert!(parsed.tls_ms.is_none());
    assert!(parsed.ttfb_ms.is_none());
    assert!(parsed.download_ms.is_none());
    assert!(parsed.total_ms.is_none());
}

#[test]
fn response_payload_omits_null_timing_fields() {
    let payload = HttpResponsePayload {
        status: 204,
        status_text: "No Content".to_string(),
        headers: vec![],
        body: String::new(),
        body_encoding: "utf8".to_string(),
        elapsed_ms: 5,
        dns_ms: None,
        tls_ms: None,
        ttfb_ms: None,
        download_ms: None,
        total_ms: None,
        size_bytes: 0,
        content_type: None,
        from_cache: false,
        cache_age_ms: None,
        request_id: None,
    };
    let json = serde_json::to_value(&payload).expect("serialize");
    assert!(json.get("dnsMs").is_none());
    assert!(json.get("tlsMs").is_none());
    assert!(json.get("ttfbMs").is_none());
    assert!(json.get("downloadMs").is_none());
    assert!(json.get("totalMs").is_none());
    assert_eq!(json["elapsedMs"], 5);
}
