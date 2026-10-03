pub mod collection_run;
pub mod contract;
pub mod curl;
pub mod graphql;
pub mod graphql_ws;
pub mod inherit;
pub mod json_assertions;
pub mod json_diff;
pub mod json_path;
pub mod mock_server;
pub mod openapi_ops;
pub mod path_params;
pub mod prepare;
pub mod script_engine;
pub mod secrets;
pub mod simple_http;
pub mod sse;
pub mod test_runner;
pub mod types;
pub mod vars;
pub mod workspace_fs;

pub use collection_run::{
    run_collection, run_collection_with_progress, CollectionRunInput, CollectionRunResult, CollectionRunStep,
};
pub use curl::{curl_to_payload, payload_to_curl};
pub use graphql::{
    build_body as build_graphql_body, build_body_raw as build_graphql_body_raw,
    format_response as format_graphql_response, list_operations as list_graphql_operations,
    summarize_schema as summarize_graphql_schema, validate as validate_graphql, INTROSPECTION_QUERY,
};
pub use mock_server::{
    routes_from_saved_requests, start_mock_server, start_mock_server_with_delay, MockRoute, MockServer,
    MockServerHandle, LOCKED_MOCK_PORT,
};
pub use test_runner::{
    read_json_path, run_http_tests, run_pre_request_script, run_pre_request_script_with_env, EnvMutation,
    PreRequestResult, TestCaseResult, TestRunResult,
};
pub use contract::{breaking_diff, check_workspace, compare_to_schema};
pub use json_diff::{compare as diff_compare, compare_raw as diff_compare_raw, pretty_any, unified_lines};
pub use prepare::{interpolate_request, to_http_payload};
pub use sse::{
    collect_sse, filter_events as filter_sse_events, latest_event_id as latest_sse_event_id,
    latest_retry_ms as latest_sse_retry_ms, next_event_boundary, parse_sse_block, parse_sse_text,
    ws_close_code_label, ParsedSseEvent, SseBuffer, SseCollectOptions,
};
pub use types::{AuthConfig, EnvVariable, HttpRequestPayload, HttpResponsePayload, KeyValue};
pub use vars::substitute_variables;
pub use workspace_fs::{
    append_agent_history, delete_request, init_workspace, is_mutating_method, list_pending, load_workspace,
    migrate_pulse_json_dumps, read_agent_history, save_workspace, write_pending, GitWorkspacePayload,
};

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

