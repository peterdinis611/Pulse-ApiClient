use crate::http::{execute_request, AuthConfig, HttpRequestPayload, KeyValue};
use crate::state::HttpState;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn sample_payload(url: &str) -> HttpRequestPayload {
    HttpRequestPayload {
        method: "GET".to_string(),
        url: url.to_string(),
        headers: vec![KeyValue {
            key: "Accept".to_string(),
            value: "application/json".to_string(),
            enabled: true,
        }],
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
        use_cache: Some(false),
        request_id: None,
        timeout_ms: Some(5_000),
    }
}

#[tokio::test]
async fn execute_request_returns_json_body() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/hello"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "message": "hello"
        })))
        .mount(&server)
        .await;

    let state = HttpState::default();
    let payload = sample_payload(&format!("{}/hello", server.uri()));
    let response = execute_request(&state, payload)
        .await
        .expect("request should succeed");

    assert_eq!(response.status, 200);
    assert!(response.body.contains("hello"));
}

#[tokio::test]
async fn execute_request_reports_timeout() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/slow"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_millis(250))
                .set_body_string("slow"),
        )
        .mount(&server)
        .await;

    let state = HttpState::default();
    let mut payload = sample_payload(&format!("{}/slow", server.uri()));
    payload.timeout_ms = Some(50);

    let error = execute_request(&state, payload)
        .await
        .expect_err("request should time out");

    assert!(error.contains("timed out"));
}
