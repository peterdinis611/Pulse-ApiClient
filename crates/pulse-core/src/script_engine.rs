use boa_engine::property::Attribute;
use boa_engine::{Context, JsString, JsValue, Source};
use serde_json::json;

use crate::test_runner::{EnvMutation, PreRequestResult, TestCaseResult, TestRunResult};
use crate::types::HttpResponsePayload;

const PRELUDE: &str = include_str!("prelude.js");

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ResponseView<'a> {
    status: u16,
    status_text: &'a str,
    headers: &'a [crate::types::ResponseHeader],
    body: &'a str,
    elapsed_ms: u64,
    size_bytes: usize,
}

fn js_error(error: boa_engine::JsError, context: &mut Context) -> String {
    error.to_opaque(context).display().to_string()
}

fn eval_source(context: &mut Context, source: &str) -> Result<JsValue, String> {
    context
        .eval(Source::from_bytes(source.as_bytes()))
        .map_err(|error| js_error(error, context))
}

fn register_json(context: &mut Context, name: &str, value: &serde_json::Value) -> Result<(), String> {
    let js_value = JsValue::from_json(value, context).map_err(|error| js_error(error, context))?;
    context
        .register_global_property(JsString::from(name), js_value, Attribute::WRITABLE)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn read_global_json(context: &mut Context, name: &str) -> Result<serde_json::Value, String> {
    let value = eval_source(context, &format!("JSON.stringify(globalThis.{name})"))?;
    match value.to_json(context).map_err(|error| js_error(error, context))? {
        serde_json::Value::String(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        other => Ok(other),
    }
}

fn boot_context(response: serde_json::Value, env: serde_json::Value) -> Result<Context, String> {
    let mut context = Context::default();
    register_json(&mut context, "__pulseResponse", &response)?;
    register_json(&mut context, "__pulseEnv", &env)?;
    eval_source(&mut context, PRELUDE)?;
    Ok(context)
}

pub fn run_js_tests(script: &str, response: &HttpResponsePayload) -> TestRunResult {
    match run_js_tests_inner(script, response) {
        Ok(result) => result,
        Err(message) => TestRunResult {
            passed: 0,
            failed: 1,
            total: 1,
            results: vec![TestCaseResult {
                name: "Script error".to_string(),
                passed: false,
                message: Some(message),
            }],
        },
    }
}

fn run_js_tests_inner(script: &str, response: &HttpResponsePayload) -> Result<TestRunResult, String> {
    let view = ResponseView {
        status: response.status,
        status_text: &response.status_text,
        headers: &response.headers,
        body: &response.body,
        elapsed_ms: response.elapsed_ms,
        size_bytes: response.size_bytes,
    };
    let mut context = boot_context(serde_json::to_value(view).unwrap(), json!({}))?;
    eval_source(&mut context, script)?;
    let tests = read_global_json(&mut context, "__pulseTests")?;
    let mut results: Vec<TestCaseResult> = serde_json::from_value(tests).unwrap_or_default();
    if results.is_empty() {
        return Ok(TestRunResult {
            passed: 0,
            failed: 1,
            total: 1,
            results: vec![TestCaseResult {
                name: "No tests found".to_string(),
                passed: false,
                message: Some("Use pulse.test(...) blocks or a JSON assertions array.".to_string()),
            }],
        });
    }
    let passed = results.iter().filter(|item| item.passed).count() as u32;
    let failed = results.len() as u32 - passed;
    for item in &mut results {
        if item.passed {
            item.message = None;
        }
    }
    Ok(TestRunResult {
        passed,
        failed,
        total: results.len() as u32,
        results,
    })
}

pub fn run_js_pre_request(script: &str, env: &serde_json::Value) -> Result<PreRequestResult, String> {
    let mut context = boot_context(
        json!({
            "status": 0,
            "statusText": "",
            "headers": [],
            "body": "",
            "elapsedMs": 0,
            "sizeBytes": 0
        }),
        env.clone(),
    )?;
    eval_source(&mut context, script)?;
    let mutations = read_global_json(&mut context, "__pulseMutations")?;
    let mutations: Vec<EnvMutation> = serde_json::from_value(mutations).unwrap_or_default();
    Ok(PreRequestResult { mutations })
}
