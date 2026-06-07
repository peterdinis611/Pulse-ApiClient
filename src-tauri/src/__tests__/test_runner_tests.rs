use super::*;
use crate::http::{HttpResponsePayload, ResponseHeader};

fn sample_response(status: u16, body: &str, elapsed_ms: u64) -> HttpResponsePayload {
    HttpResponsePayload {
        status,
        status_text: "OK".to_string(),
        headers: vec![ResponseHeader {
            key: "Content-Type".to_string(),
            value: "application/json".to_string(),
        }],
        body: body.to_string(),
        elapsed_ms,
        size_bytes: body.len(),
        content_type: Some("application/json".to_string()),
        from_cache: false,
        cache_age_ms: None,
        request_id: None,
    }
}

#[test]
fn runs_pulse_status_test() {
    let script = r#"
pulse.test("Status code is 200", function () {
    pulse.response.to.have.status(200);
});
"#;
    let response = sample_response(200, "{}", 120);
    let result = run_http_tests(script, &response);
    assert_eq!(result.total, 1);
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_legacy_pm_status_test() {
    let script = r#"
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});
"#;
    let response = sample_response(200, "{}", 120);
    let result = run_http_tests(script, &response);
    assert_eq!(result.total, 1);
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_pulse_response_time_test() {
    let script = r#"
pulse.test("Fast response", function () {
    pulse.expect(pulse.response.responseTime).to.be.below(500);
});
"#;
    let result = run_http_tests(script, &sample_response(200, "{}", 120));
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_json_assertions() {
    let script = r#"[
          {"name":"Status ok","assertion":"status","expected":200},
          {"name":"Has slug","assertion":"jsonPath","path":"slug","expected":"demo"},
          {"name":"Fast","assertion":"responseTime","maxMs":500}
        ]"#;
    let response = sample_response(200, r#"{"slug":"demo"}"#, 100);
    let result = run_http_tests(script, &response);
    assert_eq!(result.passed, 3);
}

#[test]
fn runs_multiple_assertions_in_one_test() {
    let script = r#"
pulse.test("Combined checks", function () {
    pulse.response.to.have.status(200);
    pulse.response.to.be.ok;
    pulse.expect(pulse.response.responseTime).to.be.below(500);
});
"#;
    let response = sample_response(200, "{}", 100);
    let result = run_http_tests(script, &response);
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_body_include_assertion() {
    let script = r#"
pulse.test("Body contains hello", function () {
    pulse.expect(pulse.response.text()).to.include("hello");
});
"#;
    let result = run_http_tests(script, &sample_response(200, "hello world", 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_json_data_path_assertion() {
    let script = r#"
pulse.test("Has id", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.id).to.eql(42);
});
"#;
    let result = run_http_tests(script, &sample_response(200, r#"{"id":42}"#, 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn fails_on_wrong_status() {
    let script = r#"[
          {"name":"Status ok","assertion":"status","expected":201}
        ]"#;
    let response = sample_response(200, "{}", 50);
    let result = run_http_tests(script, &response);
    assert_eq!(result.failed, 1);
}

#[test]
fn reads_nested_json_path() {
    let json = serde_json::json!({ "data": { "id": 42 } });
    let value = read_json_path(&json, "data.id").unwrap();
    assert_eq!(value, serde_json::json!(42));
}
