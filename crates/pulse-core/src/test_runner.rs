use serde::{Deserialize, Serialize};

use crate::json_assertions::run_json_assertions;
use crate::script_engine::{run_js_pre_request, run_js_tests};
use crate::types::HttpResponsePayload;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCaseResult {
    pub name: String,
    pub passed: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunResult {
    pub passed: u32,
    pub failed: u32,
    pub total: u32,
    pub results: Vec<TestCaseResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvMutation {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreRequestResult {
    pub mutations: Vec<EnvMutation>,
}

pub fn summarize(results: Vec<TestCaseResult>) -> TestRunResult {
    let passed = results.iter().filter(|item| item.passed).count() as u32;
    let failed = results.len() as u32 - passed;
    TestRunResult {
        passed,
        failed,
        total: results.len() as u32,
        results,
    }
}

pub fn single_failure(name: &str, message: &str) -> TestRunResult {
    TestRunResult {
        passed: 0,
        failed: 1,
        total: 1,
        results: vec![TestCaseResult {
            name: name.to_string(),
            passed: false,
            message: Some(message.to_string()),
        }],
    }
}

pub fn run_http_tests(script: &str, response: &HttpResponsePayload) -> TestRunResult {
    let trimmed = script.trim();
    if trimmed.is_empty() {
        return TestRunResult {
            passed: 0,
            failed: 0,
            total: 0,
            results: Vec::new(),
        };
    }
    if trimmed.starts_with('[') {
        return run_json_assertions(trimmed, response);
    }
    let normalized = trimmed.replace("pm.", "pulse.");
    run_js_tests(&normalized, response)
}

pub fn run_pre_request_script(script: &str) -> PreRequestResult {
    run_pre_request_script_with_env(script, &serde_json::json!({}))
}

pub fn run_pre_request_script_with_env(script: &str, env: &serde_json::Value) -> PreRequestResult {
    let normalized = script.replace("pm.", "pulse.");
    if normalized.trim().is_empty() {
        return PreRequestResult { mutations: Vec::new() };
    }
    run_js_pre_request(&normalized, env).unwrap_or_else(|message| PreRequestResult {
        mutations: vec![EnvMutation {
            key: "__scriptError".into(),
            value: message,
        }],
    })
}

pub use crate::json_path::read_json_path;
