use pyo3::exceptions::PyRuntimeError;
use pyo3::prelude::*;
use pyo3::types::PyAny;
use pyo3::types::PyModule;
use pulse_core::contract::check_workspace;
use pulse_core::graphql::{
    build_body_raw as gql_build_body_raw, format_response as gql_format_response,
    list_operations as gql_list_operations, summarize_schema as gql_summarize_schema,
    validate as gql_validate, INTROSPECTION_QUERY,
};
use pulse_core::graphql_ws::{
    complete as gql_complete, connection_init, connection_init_payload_from_auth, parse_message,
    ping as gql_ping, pong as gql_pong, start as gql_start, stop as gql_stop,
    subscribe as gql_subscribe, GRAPHQL_WS_PROTOCOLS,
};
use pulse_core::simple_http::send_once;
use pulse_core::types::EnvVariable;
use pulse_core::workspace_fs::load_workspace;
use pulse_core::{
    breaking_diff, collect_sse, compare_to_schema, delete_fact, format_rag_hits_markdown, get_fact,
    init_workspace, list_facts, migrate_pulse_json_dumps, parse_sse_text, rebuild_rag_index,
    routes_from_saved_requests, run_collection_with_progress, run_http_tests,
    run_pre_request_script_with_env, search_facts, search_rag, start_mock_server_with_delay,
    substitute_variables, upsert_fact, CollectionRunInput, CollectionRunStep, HttpRequestPayload,
    HttpResponsePayload, MemoryScope, MockRoute, MockServer, SseCollectOptions, UpsertFactInput,
};
use std::sync::Mutex;

fn py_err(message: impl ToString) -> PyErr {
    PyRuntimeError::new_err(message.to_string())
}

struct MockHold {
    _runtime: tokio::runtime::Runtime,
    server: MockServer,
}

static MOCK_STATE: Mutex<Option<MockHold>> = Mutex::new(None);

fn progress_event(step: &CollectionRunStep, index: u32, total: u32) -> serde_json::Value {
    let failed = step.test_results.as_ref().map(|item| item.failed).unwrap_or(0);
    let status = if step.error.is_some() {
        "error"
    } else if failed > 0 {
        "fail"
    } else {
        "ok"
    };
    let ms = step
        .response
        .as_ref()
        .map(|item| item.total_ms.unwrap_or(item.elapsed_ms));
    serde_json::json!({
        "index": index,
        "total": total,
        "name": step.saved.name,
        "status": status,
        "ms": ms,
        "error": step.error,
        "failed": failed,
    })
}

#[pyfunction]
fn interpolate(template: String, env_json: String) -> PyResult<String> {
    let map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&env_json).map_err(py_err)?;
    let variables: Vec<EnvVariable> = map
        .into_iter()
        .map(|(key, value)| EnvVariable {
            id: key.clone(),
            secret: key.starts_with("secret."),
            key,
            value: match value {
                serde_json::Value::String(text) => text,
                other => other.to_string(),
            },
            enabled: true,
        })
        .collect();
    Ok(substitute_variables(&template, &variables))
}

#[pyfunction]
fn run_tests(script: String, response_json: String) -> PyResult<String> {
    let response: HttpResponsePayload = serde_json::from_str(&response_json).map_err(py_err)?;
    let result = run_http_tests(&script, &response);
    serde_json::to_string(&result).map_err(py_err)
}

#[pyfunction]
fn run_pre_request(script: String, env_json: String) -> PyResult<String> {
    let env: serde_json::Value =
        serde_json::from_str(&env_json).unwrap_or_else(|_| serde_json::json!({}));
    let result = run_pre_request_script_with_env(&script, &env);
    serde_json::to_string(&result).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (input_json, on_progress=None))]
fn run_collection_json(
    py: Python<'_>,
    input_json: String,
    on_progress: Option<Py<PyAny>>,
) -> PyResult<String> {
    let input: CollectionRunInput = serde_json::from_str(&input_json).map_err(py_err)?;
    let runtime = tokio::runtime::Runtime::new().map_err(py_err)?;
    let result = py.allow_threads(|| {
        runtime.block_on(async {
            run_collection_with_progress(
                input,
                |payload| async move { send_once(payload).await },
                Some(|payloads: Vec<pulse_core::HttpRequestPayload>| async move {
                    let mut results = Vec::with_capacity(payloads.len());
                    for payload in payloads {
                        results.push(match send_once(payload).await {
                            Ok(response) => (Some(response), None),
                            Err(error) => (None, Some(error)),
                        });
                    }
                    results
                }),
                |step, index, total| {
                    let Some(callback) = on_progress.as_ref() else {
                        return;
                    };
                    let payload = progress_event(step, index, total).to_string();
                    let _ = Python::with_gil(|py| callback.call1(py, (payload,)));
                },
            )
            .await
        })
    });
    serde_json::to_string(&result).map_err(py_err)
}

#[pyfunction]
fn send_once_json(payload_json: String) -> PyResult<String> {
    let payload: HttpRequestPayload = serde_json::from_str(&payload_json).map_err(py_err)?;
    let runtime = tokio::runtime::Runtime::new().map_err(py_err)?;
    let response = runtime.block_on(send_once(payload)).map_err(py_err)?;
    serde_json::to_string(&response).map_err(py_err)
}

#[pyfunction]
fn load_workspace_json(root: String) -> PyResult<String> {
    let payload = load_workspace(&root).map_err(py_err)?;
    serde_json::to_string(&payload).map_err(py_err)
}

#[pyfunction]
fn check_workspace_json(root: String) -> PyResult<String> {
    let report = check_workspace(&root).map_err(py_err)?;
    serde_json::to_string(&serde_json::json!({ "ok": report.ok, "errors": report.errors }))
        .map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (root, name=None))]
fn init_workspace_json(root: String, name: Option<String>) -> PyResult<String> {
    let path = init_workspace(&root, name.as_deref().unwrap_or("Pulse")).map_err(py_err)?;
    serde_json::to_string(&serde_json::json!({ "path": path.to_string_lossy() })).map_err(py_err)
}

#[pyfunction]
fn migrate_workspace_json(root: String) -> PyResult<String> {
    let migrated = migrate_pulse_json_dumps(&root).map_err(py_err)?;
    serde_json::to_string(&serde_json::json!({ "migrated": migrated })).map_err(py_err)
}

#[pyfunction]
fn parse_sse_json(text: String) -> PyResult<String> {
    let events = parse_sse_text(&text).map_err(py_err)?;
    serde_json::to_string(&events).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (url, method=None, headers_json=None, body=None, max_events=None, timeout_ms=None, last_event_id=None, event_filter=None))]
fn collect_sse_json(
    url: String,
    method: Option<String>,
    headers_json: Option<String>,
    body: Option<String>,
    max_events: Option<usize>,
    timeout_ms: Option<u64>,
    last_event_id: Option<String>,
    event_filter: Option<String>,
) -> PyResult<String> {
    let headers: Vec<(String, String)> = match headers_json.filter(|item| !item.trim().is_empty()) {
        Some(raw) => {
            let map: serde_json::Map<String, serde_json::Value> =
                serde_json::from_str(&raw).map_err(py_err)?;
            map.into_iter()
                .map(|(key, value)| {
                    (
                        key,
                        match value {
                            serde_json::Value::String(text) => text,
                            other => other.to_string(),
                        },
                    )
                })
                .collect()
        }
        None => Vec::new(),
    };
    let options = SseCollectOptions {
        method: method.unwrap_or_else(|| "GET".into()),
        headers,
        body,
        max_events: max_events.unwrap_or(50),
        timeout_ms: timeout_ms.unwrap_or(30_000),
        last_event_id,
        event_filter,
    };
    let runtime = tokio::runtime::Runtime::new().map_err(py_err)?;
    let events = runtime
        .block_on(collect_sse(&url, options))
        .map_err(py_err)?;
    serde_json::to_string(&events).map_err(py_err)
}

#[pyfunction]
fn compare_schema_json(body: String, schema_json: String) -> PyResult<String> {
    let schema: serde_json::Value = serde_json::from_str(&schema_json).map_err(py_err)?;
    let report = compare_to_schema(&body, &schema);
    serde_json::to_string(&serde_json::json!({ "ok": report.ok, "errors": report.errors }))
        .map_err(py_err)
}

#[pyfunction]
fn breaking_diff_json(previous_json: String, current_json: String) -> PyResult<String> {
    let previous: serde_json::Value = serde_json::from_str(&previous_json).map_err(py_err)?;
    let current: serde_json::Value = serde_json::from_str(&current_json).map_err(py_err)?;
    let errors = breaking_diff(&previous, &current);
    serde_json::to_string(&serde_json::json!({
        "ok": errors.is_empty(),
        "errors": errors,
    }))
    .map_err(py_err)
}

#[pyfunction]
fn diff_json(left_json: String, right_json: String) -> PyResult<String> {
    let left: serde_json::Value = serde_json::from_str(&left_json)
        .unwrap_or_else(|_| serde_json::Value::String(left_json.clone()));
    let right: serde_json::Value = serde_json::from_str(&right_json)
        .unwrap_or_else(|_| serde_json::Value::String(right_json.clone()));
    Ok(pulse_core::diff_compare(&left, &right))
}

#[pyfunction]
#[pyo3(signature = (kind, id=None, query=None, variables_json=None, operation_name=None, payload_json=None, auth_json=None))]
fn graphql_ws_frame_json(
    kind: String,
    id: Option<String>,
    query: Option<String>,
    variables_json: Option<String>,
    operation_name: Option<String>,
    payload_json: Option<String>,
    auth_json: Option<String>,
) -> PyResult<String> {
    let frame = match kind.as_str() {
        "connection_init" => {
            let payload = if let Some(raw) = payload_json.filter(|item| !item.trim().is_empty()) {
                Some(serde_json::from_str(&raw).map_err(py_err)?)
            } else if let Some(raw) = auth_json.filter(|item| !item.trim().is_empty()) {
                let auth: serde_json::Value = serde_json::from_str(&raw).map_err(py_err)?;
                connection_init_payload_from_auth(
                    auth.get("authType")
                        .and_then(|v| v.as_str())
                        .unwrap_or("none"),
                    auth.get("bearerToken").and_then(|v| v.as_str()),
                    auth.get("apiKeyKey").and_then(|v| v.as_str()),
                    auth.get("apiKeyValue").and_then(|v| v.as_str()),
                    auth.get("apiKeyIn").and_then(|v| v.as_str()),
                )
            } else {
                None
            };
            connection_init(payload)
        }
        "subscribe" | "start" => {
            let sid = id.ok_or_else(|| py_err("subscribe requires id"))?;
            let q = query.ok_or_else(|| py_err("subscribe requires query"))?;
            let variables = variables_json
                .filter(|item| !item.trim().is_empty())
                .map(|raw| serde_json::from_str(&raw))
                .transpose()
                .map_err(py_err)?;
            let op = operation_name.as_deref().filter(|item| !item.is_empty());
            if kind == "start" {
                gql_start(&sid, &q, variables, op)
            } else {
                gql_subscribe(&sid, &q, variables, op)
            }
        }
        "complete" => {
            let sid = id.ok_or_else(|| py_err("complete requires id"))?;
            gql_complete(&sid)
        }
        "stop" => {
            let sid = id.ok_or_else(|| py_err("stop requires id"))?;
            gql_stop(&sid)
        }
        "ping" => {
            let payload = payload_json
                .filter(|item| !item.trim().is_empty())
                .map(|raw| serde_json::from_str(&raw))
                .transpose()
                .map_err(py_err)?;
            gql_ping(payload)
        }
        "pong" => {
            let payload = payload_json
                .filter(|item| !item.trim().is_empty())
                .map(|raw| serde_json::from_str(&raw))
                .transpose()
                .map_err(py_err)?;
            gql_pong(payload)
        }
        other => return Err(py_err(format!("Unknown graphql-ws frame kind: {other}"))),
    };
    Ok(frame)
}

#[pyfunction]
fn graphql_ws_parse_json(text: String) -> PyResult<String> {
    match parse_message(&text) {
        Some(msg) => serde_json::to_string(&msg).map_err(py_err),
        None => Ok("null".into()),
    }
}

#[pyfunction]
#[pyo3(signature = (query, variables_json=None, operation_name=None))]
fn graphql_build_body_json(
    query: String,
    variables_json: Option<String>,
    operation_name: Option<String>,
) -> PyResult<String> {
    gql_build_body_raw(
        &query,
        variables_json.as_deref().unwrap_or("{}"),
        operation_name.as_deref(),
    )
    .map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (query, variables_json=None, operation_name=None))]
fn graphql_validate_json(
    query: String,
    variables_json: Option<String>,
    operation_name: Option<String>,
) -> PyResult<String> {
    let error = gql_validate(
        &query,
        variables_json.as_deref().unwrap_or("{}"),
        operation_name.as_deref(),
    );
    serde_json::to_string(&serde_json::json!({ "ok": error.is_none(), "error": error })).map_err(py_err)
}

#[pyfunction]
fn graphql_format_response_json(body: String) -> PyResult<String> {
    Ok(gql_format_response(&body))
}

#[pyfunction]
fn graphql_summarize_schema_json(body: String) -> PyResult<String> {
    match gql_summarize_schema(&body) {
        Some(summary) => serde_json::to_string(&summary).map_err(py_err),
        None => Err(py_err("No GraphQL __schema found in body")),
    }
}

#[pyfunction]
fn graphql_list_operations_json(document: String) -> PyResult<String> {
    serde_json::to_string(&gql_list_operations(&document)).map_err(py_err)
}

#[pyfunction]
fn graphql_introspection_query() -> PyResult<String> {
    Ok(INTROSPECTION_QUERY.to_string())
}

#[pyfunction]
fn graphql_ws_protocols() -> PyResult<String> {
    Ok(GRAPHQL_WS_PROTOCOLS.to_string())
}

#[pyfunction]
#[pyo3(signature = (routes_json=None, delay_ms=0, workspace=None))]
fn mock_start_json(
    routes_json: Option<String>,
    delay_ms: u64,
    workspace: Option<String>,
) -> PyResult<String> {
    let routes: Vec<MockRoute> =
        if let Some(raw) = routes_json.filter(|item| !item.trim().is_empty()) {
            serde_json::from_str(&raw).map_err(py_err)?
        } else if let Some(root) = workspace.filter(|item| !item.trim().is_empty()) {
            let payload = load_workspace(&root).map_err(py_err)?;
            routes_from_saved_requests(&payload.collections)
        } else {
            return Err(py_err("Provide routes_json or workspace"));
        };
    if routes.is_empty() {
        return Err(py_err("No mock routes (save response examples first)"));
    }
    let runtime = tokio::runtime::Runtime::new().map_err(py_err)?;
    let server = runtime
        .block_on(start_mock_server_with_delay(routes, delay_ms))
        .map_err(py_err)?;
    let handle = serde_json::to_string(&server.handle).map_err(py_err)?;
    let mut guard = MOCK_STATE.lock().map_err(|error| py_err(error.to_string()))?;
    *guard = Some(MockHold {
        _runtime: runtime,
        server,
    });
    Ok(handle)
}

#[pyfunction]
fn mock_stop() -> PyResult<()> {
    let mut guard = MOCK_STATE.lock().map_err(|error| py_err(error.to_string()))?;
    if let Some(mut hold) = guard.take() {
        hold.server.stop();
    }
    Ok(())
}

#[pyfunction]
fn parse_curl_json(command: String) -> PyResult<String> {
    let payload = pulse_core::curl_to_payload(&command).map_err(py_err)?;
    serde_json::to_string(&payload).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (input, workspace=None, body=None, history_limit=None, source=None, record_history=None))]
fn run_agent_json(
    input: String,
    workspace: Option<String>,
    body: Option<String>,
    history_limit: Option<usize>,
    source: Option<String>,
    record_history: Option<bool>,
) -> PyResult<String> {
    let source_owned = source.unwrap_or_else(|| "cli-agent".into());
    let opts = pulse_core::AgentExecuteOptions {
        workspace_root: workspace.as_deref(),
        graphql_body: body.as_deref(),
        history_limit: history_limit.unwrap_or(15),
        source: &source_owned,
        record_history: record_history.unwrap_or(true),
    };
    let result = pulse_core::run_agent(&input, &opts).map_err(py_err)?;
    serde_json::to_string(&result).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (workspace, scope=None))]
fn agent_memory_list_json(workspace: String, scope: Option<String>) -> PyResult<String> {
    let scope = scope.as_deref().and_then(MemoryScope::parse);
    let facts = list_facts(&workspace, scope).map_err(py_err)?;
    serde_json::to_string(&facts).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (workspace, key, scope=None))]
fn agent_memory_get_json(
    workspace: String,
    key: String,
    scope: Option<String>,
) -> PyResult<String> {
    let scope = scope.as_deref().and_then(MemoryScope::parse);
    let fact = get_fact(&workspace, &key, scope).map_err(py_err)?;
    serde_json::to_string(&fact).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (workspace, key, value, scope=None, source=None, note=None))]
fn agent_memory_upsert_json(
    workspace: String,
    key: String,
    value: String,
    scope: Option<String>,
    source: Option<String>,
    note: Option<String>,
) -> PyResult<String> {
    let scope = MemoryScope::parse(scope.as_deref().unwrap_or("workspace"))
        .unwrap_or(MemoryScope::Workspace);
    let source_owned = source.unwrap_or_else(|| "cli".into());
    let fact = upsert_fact(
        &workspace,
        UpsertFactInput {
            key: &key,
            value: &value,
            scope,
            source: &source_owned,
            tags: Vec::new(),
            note: note.as_deref(),
            expires_at: None,
        },
    )
    .map_err(py_err)?;
    serde_json::to_string(&fact).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (workspace, key, scope=None))]
fn agent_memory_delete_json(
    workspace: String,
    key: String,
    scope: Option<String>,
) -> PyResult<bool> {
    let scope = scope.as_deref().and_then(MemoryScope::parse);
    delete_fact(&workspace, &key, scope).map_err(py_err)
}

#[pyfunction]
fn agent_memory_search_json(workspace: String, query: String) -> PyResult<String> {
    let facts = search_facts(&workspace, &query).map_err(py_err)?;
    serde_json::to_string(&facts).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (workspace, query, limit=None))]
fn agent_rag_search_json(
    workspace: String,
    query: String,
    limit: Option<u32>,
) -> PyResult<String> {
    let hits = search_rag(&workspace, &query, limit.unwrap_or(8) as usize).map_err(py_err)?;
    serde_json::to_string(&hits).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (workspace, query, limit=None))]
fn agent_rag_search_markdown(
    workspace: String,
    query: String,
    limit: Option<u32>,
) -> PyResult<String> {
    let hits = search_rag(&workspace, &query, limit.unwrap_or(8) as usize).map_err(py_err)?;
    Ok(format_rag_hits_markdown(&hits, &query))
}

#[pyfunction]
fn agent_rag_reindex_json(workspace: String) -> PyResult<usize> {
    rebuild_rag_index(&workspace, &[]).map_err(py_err)
}

#[pyfunction]
fn format_curl_json(payload_json: String) -> PyResult<String> {
    let payload: HttpRequestPayload = serde_json::from_str(&payload_json).map_err(py_err)?;
    Ok(pulse_core::payload_to_curl(&payload))
}

#[pymodule]
fn pulse_native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(interpolate, m)?)?;
    m.add_function(wrap_pyfunction!(run_tests, m)?)?;
    m.add_function(wrap_pyfunction!(run_pre_request, m)?)?;
    m.add_function(wrap_pyfunction!(run_collection_json, m)?)?;
    m.add_function(wrap_pyfunction!(send_once_json, m)?)?;
    m.add_function(wrap_pyfunction!(load_workspace_json, m)?)?;
    m.add_function(wrap_pyfunction!(check_workspace_json, m)?)?;
    m.add_function(wrap_pyfunction!(init_workspace_json, m)?)?;
    m.add_function(wrap_pyfunction!(migrate_workspace_json, m)?)?;
    m.add_function(wrap_pyfunction!(parse_sse_json, m)?)?;
    m.add_function(wrap_pyfunction!(collect_sse_json, m)?)?;
    m.add_function(wrap_pyfunction!(compare_schema_json, m)?)?;
    m.add_function(wrap_pyfunction!(breaking_diff_json, m)?)?;
    m.add_function(wrap_pyfunction!(diff_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_ws_frame_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_ws_parse_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_ws_protocols, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_build_body_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_validate_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_format_response_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_summarize_schema_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_list_operations_json, m)?)?;
    m.add_function(wrap_pyfunction!(graphql_introspection_query, m)?)?;
    m.add_function(wrap_pyfunction!(parse_curl_json, m)?)?;
    m.add_function(wrap_pyfunction!(format_curl_json, m)?)?;
    m.add_function(wrap_pyfunction!(run_agent_json, m)?)?;
    m.add_function(wrap_pyfunction!(agent_memory_list_json, m)?)?;
    m.add_function(wrap_pyfunction!(agent_memory_get_json, m)?)?;
    m.add_function(wrap_pyfunction!(agent_memory_upsert_json, m)?)?;
    m.add_function(wrap_pyfunction!(agent_memory_delete_json, m)?)?;
    m.add_function(wrap_pyfunction!(agent_memory_search_json, m)?)?;
    m.add_function(wrap_pyfunction!(agent_rag_search_json, m)?)?;
    m.add_function(wrap_pyfunction!(agent_rag_search_markdown, m)?)?;
    m.add_function(wrap_pyfunction!(agent_rag_reindex_json, m)?)?;
    m.add_function(wrap_pyfunction!(mock_start_json, m)?)?;
    m.add_function(wrap_pyfunction!(mock_stop, m)?)?;
    Ok(())
}
