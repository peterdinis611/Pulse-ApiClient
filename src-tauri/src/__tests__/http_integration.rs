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
    assert!(response.ttfb_ms.is_some());
    assert!(response.download_ms.is_some());
    assert!(response.total_ms.is_some());
    assert_eq!(response.elapsed_ms, response.total_ms.unwrap());
    assert!(response.elapsed_ms >= response.ttfb_ms.unwrap());
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

#[tokio::test]
async fn execute_request_records_set_cookie() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/session"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string("ok")
                .insert_header("set-cookie", "session=abc123; Path=/; HttpOnly"),
        )
        .mount(&server)
        .await;

    let state = HttpState::default();
    let payload = sample_payload(&format!("{}/session", server.uri()));
    let response = execute_request(&state, payload)
        .await
        .expect("request should succeed");

    assert_eq!(response.status, 200);
    let cookies = state.list_cookies();
    assert_eq!(cookies.len(), 1);
    assert_eq!(cookies[0].name, "session");
    assert_eq!(cookies[0].value, "abc123");
}

#[tokio::test]
async fn execute_requests_batch_returns_all_results() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/one"))
        .respond_with(ResponseTemplate::new(200).set_body_string("one"))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/two"))
        .respond_with(ResponseTemplate::new(201).set_body_string("two"))
        .mount(&server)
        .await;

    let state = HttpState::default();
    let payloads = vec![
        sample_payload(&format!("{}/one", server.uri())),
        sample_payload(&format!("{}/two", server.uri())),
    ];

    let results = crate::http::execute_requests_batch(&state, payloads).await;
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].response.as_ref().map(|item| item.status), Some(200));
    assert_eq!(results[1].response.as_ref().map(|item| item.status), Some(201));
}
