use pyo3::exceptions::PyRuntimeError;
use pyo3::prelude::*;
use pyo3::types::PyModule;
use pulse_core::{
    run_collection, run_http_tests, run_pre_request_script_with_env, substitute_variables, CollectionRunInput,
    HttpRequestPayload, HttpResponsePayload,
};
use pulse_core::simple_http::send_once;
use pulse_core::types::EnvVariable;

fn py_err(message: impl ToString) -> PyErr {
    PyRuntimeError::new_err(message.to_string())
}

#[pyfunction]
fn interpolate(template: String, env_json: String) -> PyResult<String> {
    let map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&env_json).map_err(py_err)?;
    let variables: Vec<EnvVariable> = map
        .into_iter()
        .map(|(key, value)| EnvVariable {
            id: key.clone(),
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
fn run_collection_json(input_json: String) -> PyResult<String> {
    let input: CollectionRunInput = serde_json::from_str(&input_json).map_err(py_err)?;
    let runtime = tokio::runtime::Runtime::new().map_err(py_err)?;
    let result = runtime.block_on(async {
        run_collection(
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
        )
        .await
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

#[pymodule]
fn pulse_native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(interpolate, m)?)?;
    m.add_function(wrap_pyfunction!(run_tests, m)?)?;
    m.add_function(wrap_pyfunction!(run_pre_request, m)?)?;
    m.add_function(wrap_pyfunction!(run_collection_json, m)?)?;
    m.add_function(wrap_pyfunction!(send_once_json, m)?)?;
    Ok(())
}
