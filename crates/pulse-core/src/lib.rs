pub mod collection_run;
pub mod contract;
pub mod graphql_ws;
pub mod inherit;
pub mod json_assertions;
pub mod json_path;
pub mod mock_server;
pub mod openapi_ops;
pub mod path_params;
pub mod prepare;
pub mod script_engine;
pub mod secrets;
pub mod simple_http;
pub mod test_runner;
pub mod types;
pub mod vars;
pub mod workspace_fs;

pub use collection_run::{
    run_collection, run_collection_with_progress, CollectionRunInput, CollectionRunResult, CollectionRunStep,
};
pub use test_runner::{
    read_json_path, run_http_tests, run_pre_request_script, run_pre_request_script_with_env, EnvMutation,
    PreRequestResult, TestCaseResult, TestRunResult,
};
pub use types::{HttpRequestPayload, HttpResponsePayload};
pub use vars::substitute_variables;
pub use workspace_fs::{load_workspace, save_workspace, GitWorkspacePayload};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{HttpResponsePayload, ResponseHeader};

    fn sample_response(status: u16, body: &str, elapsed_ms: u64) -> HttpResponsePayload {
        HttpResponsePayload {
            status,
            status_text: "OK".into(),
            headers: vec![ResponseHeader {
                key: "Content-Type".into(),
                value: "application/json".into(),
            }],
            body: body.into(),
            body_encoding: "utf8".into(),
            elapsed_ms,
            dns_ms: None,
            tls_ms: None,
            ttfb_ms: None,
            download_ms: None,
            total_ms: None,
            size_bytes: body.len(),
            content_type: Some("application/json".into()),
            from_cache: false,
            cache_age_ms: None,
            request_id: None,
        }
    }

    #[test]
    fn boa_runs_real_javascript() {
        let script = r#"
pulse.test("math", function () {
    var n = 1 + 1;
    pulse.expect(n).to.eql(2);
});
"#;
        let result = run_http_tests(script, &sample_response(200, "{}", 10));
        assert_eq!(result.passed, 1, "{:?}", result.results);
    }

    #[test]
    fn boa_reads_json_and_legacy_pm() {
        let script = r#"
pm.test("Has id", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.id).to.eql(42);
});
"#;
        let result = run_http_tests(script, &sample_response(200, r#"{"id":42}"#, 50));
        assert_eq!(result.passed, 1, "{:?}", result.results);
    }

    #[test]
    fn pre_request_concatenates_in_js() {
        let result = run_pre_request_script(r#"pulse.environment.set("token", "abc" + "123");"#);
        assert_eq!(result.mutations.len(), 1);
        assert_eq!(result.mutations[0].value, "abc123");
    }
}

