use super::*;
use crate::http::{AuthConfig, ResponseHeader};

fn sample_payload(method: &str) -> HttpRequestPayload {
    HttpRequestPayload {
        method: method.to_string(),
        url: "https://example.com/data".to_string(),
        headers: vec![],
        query: vec![],
        body_kind: "none".to_string(),
        body: String::new(),
        form: vec![],
        multipart: vec![],
        auth: AuthConfig {
            auth_type: "none".to_string(),
            bearer_token: None,
            basic_username: None,
            basic_password: None,
            api_key_key: None,
            api_key_value: None,
            api_key_in: None,
        },
        use_cache: None,
        request_id: None,
        timeout_ms: None,
    }
}

fn sample_response(status: u16) -> HttpResponsePayload {
    HttpResponsePayload {
        status,
        status_text: "OK".to_string(),
        headers: vec![ResponseHeader {
            key: "Cache-Control".to_string(),
            value: "no-store".to_string(),
        }],
        body: String::new(),
        elapsed_ms: 10,
        size_bytes: 0,
        content_type: None,
        from_cache: false,
        cache_age_ms: None,
        request_id: None,
    }
}

#[test]
fn get_requests_use_cache_by_default() {
    assert!(should_use_cache(
        &sample_payload("GET"),
        &CacheConfig::default()
    ));
}

#[test]
fn post_requests_skip_cache_by_default() {
    assert!(!should_use_cache(
        &sample_payload("POST"),
        &CacheConfig::default()
    ));
}

#[test]
fn does_not_store_failed_responses() {
    assert!(!should_store_in_cache(
        &sample_payload("GET"),
        &sample_response(500),
        &CacheConfig::default()
    ));
}

#[test]
fn cache_key_is_stable_for_same_payload() {
    let left = cache_key(&sample_payload("GET"));
    let right = cache_key(&sample_payload("GET"));
    assert_eq!(left, right);
}

#[test]
fn cache_key_changes_with_form_fields() {
    let mut left = sample_payload("POST");
    left.form.push(KeyValue {
        key: "a".to_string(),
        value: "1".to_string(),
        enabled: true,
    });

    let mut right = sample_payload("POST");
    right.form.push(KeyValue {
        key: "b".to_string(),
        value: "2".to_string(),
        enabled: true,
    });

    assert_ne!(cache_key(&left), cache_key(&right));
}

#[test]
fn request_cache_control_opt_out() {
    let mut payload = sample_payload("GET");
    payload.headers.push(KeyValue {
        key: "Cache-Control".to_string(),
        value: "no-cache".to_string(),
        enabled: true,
    });
    assert!(!should_use_cache(&payload, &CacheConfig::default()));
}

#[test]
fn parses_max_age_from_response() {
    let response = HttpResponsePayload {
        status: 200,
        status_text: "OK".to_string(),
        headers: vec![ResponseHeader {
            key: "Cache-Control".to_string(),
            value: "public, max-age=120".to_string(),
        }],
        body: String::new(),
        elapsed_ms: 1,
        size_bytes: 0,
        content_type: None,
        from_cache: false,
        cache_age_ms: None,
        request_id: None,
    };

    assert_eq!(
        cache_ttl_from_response(&response, DEFAULT_TTL),
        Duration::from_secs(120)
    );
}

#[test]
fn private_responses_can_be_cached() {
    let response = HttpResponsePayload {
        status: 200,
        status_text: "OK".to_string(),
        headers: vec![ResponseHeader {
            key: "Cache-Control".to_string(),
            value: "private, max-age=60".to_string(),
        }],
        body: "ok".to_string(),
        elapsed_ms: 1,
        size_bytes: 2,
        content_type: None,
        from_cache: false,
        cache_age_ms: None,
        request_id: None,
    };

    assert!(should_store_in_cache(
        &sample_payload("GET"),
        &response,
        &CacheConfig::default()
    ));
}
