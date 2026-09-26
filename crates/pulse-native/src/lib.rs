use pyo3::exceptions::PyRuntimeError;
use pyo3::prelude::*;
use pyo3::types::PyAny;
use pyo3::types::PyModule;
use pulse_core::{
    routes_from_saved_requests, run_collection_with_progress, run_http_tests,
    run_pre_request_script_with_env, start_mock_server_with_delay, substitute_variables,
    CollectionRunInput, CollectionRunStep, HttpRequestPayload, HttpResponsePayload, MockRoute,
    MockServer,
};
use pulse_core::contract::check_workspace;
use pulse_core::simple_http::send_once;
use pulse_core::types::EnvVariable;
use pulse_core::workspace_fs::load_workspace;
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
    let ms = step.response.as_ref().map(|item| item.total_ms.unwrap_or(item.elapsed_ms));
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
    let env: serde_json::Value = serde_json::from_str(&env_json).unwrap_or_else(|_| serde_json::json!({}));
    let result = run_pre_request_script_with_env(&script, &env);
    serde_json::to_string(&result).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (input_json, on_progress=None))]
fn run_collection_json(py: Python<'_>, input_json: String, on_progress: Option<Py<PyAny>>) -> PyResult<String> {
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
    serde_json::to_string(&serde_json::json!({ "ok": report.ok, "errors": report.errors })).map_err(py_err)
}

#[pyfunction]
#[pyo3(signature = (routes_json=None, delay_ms=0, workspace=None))]
fn mock_start_json(
    routes_json: Option<String>,
    delay_ms: u64,
    workspace: Option<String>,
) -> PyResult<String> {
    let routes: Vec<MockRoute> = if let Some(raw) = routes_json.filter(|item| !item.trim().is_empty()) {
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

#[pymodule]
fn pulse_native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(interpolate, m)?)?;
    m.add_function(wrap_pyfunction!(run_tests, m)?)?;
    m.add_function(wrap_pyfunction!(run_pre_request, m)?)?;
    m.add_function(wrap_pyfunction!(run_collection_json, m)?)?;
    m.add_function(wrap_pyfunction!(send_once_json, m)?)?;
    m.add_function(wrap_pyfunction!(load_workspace_json, m)?)?;
    m.add_function(wrap_pyfunction!(check_workspace_json, m)?)?;
    m.add_function(wrap_pyfunction!(mock_start_json, m)?)?;
    m.add_function(wrap_pyfunction!(mock_stop, m)?)?;
    Ok(())
}
