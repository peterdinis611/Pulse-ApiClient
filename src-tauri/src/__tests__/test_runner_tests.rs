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
        body_encoding: "utf8".to_string(),
        elapsed_ms,
        dns_ms: None,
        tls_ms: None,
        ttfb_ms: None,
        download_ms: None,
        total_ms: None,
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

#[test]
fn reads_array_json_path() {
    let json = serde_json::json!({ "items": [{ "id": 7 }] });
    let value = read_json_path(&json, "items[0].id").unwrap();
    assert_eq!(value, serde_json::json!(7));
}

#[test]
fn runs_graphql_errors_fallback() {
    let script = r#"
pulse.test("GraphQL has no errors", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.errors || []).to.eql([]);
});
"#;
    let result = run_http_tests(script, &sample_response(200, r#"{"data":{"ok":true}}"#, 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_client_error_assertion() {
    let script = r#"
pulse.test("Client error", function () {
    pulse.response.to.be.clientError;
});
"#;
    let result = run_http_tests(script, &sample_response(404, "{}", 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_json_array_length_assertion() {
    let script = r#"
pulse.test("Items length", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.items).to.have.lengthOf(2);
});
"#;
    let result = run_http_tests(script, &sample_response(200, r#"{"items":[1,2]}"#, 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_json_type_assertion() {
    let script = r#"
pulse.test("Results is array", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.results).to.be.an("array");
});
"#;
    let result = run_http_tests(script, &sample_response(200, r#"{"results":[]}"#, 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_header_include_assertion() {
    let script = r#"
pulse.test("JSON content type", function () {
    pulse.expect(pulse.response.headers.get("Content-Type")).to.include("json");
});
"#;
    let result = run_http_tests(script, &sample_response(200, "{}", 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn runs_json_exists_json_assertion() {
    let script = r#"[
      {"name":"Slug exists","assertion":"jsonExists","path":"slug"}
    ]"#;
    let result = run_http_tests(script, &sample_response(200, r#"{"slug":"demo"}"#, 50));
    assert_eq!(result.passed, 1);
}

#[test]
fn extracts_environment_set_mutations() {
    let script = r#"
pulse.environment.set("token", "abc123");
pm.variables.set("page", 2);
pulse.environment.set("token", "final");
"#;
    let result = run_pre_request_script(script);
    assert_eq!(result.mutations.len(), 2);
    assert_eq!(result.mutations[0].key, "page");
    assert_eq!(result.mutations[0].value, "2");
    assert_eq!(result.mutations[1].key, "token");
    assert_eq!(result.mutations[1].value, "final");
}
