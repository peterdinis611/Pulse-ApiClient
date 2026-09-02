use regex::Regex;
use serde::Deserialize;

use crate::test_runner::{single_failure, summarize, TestCaseResult, TestRunResult};
use crate::types::HttpResponsePayload;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "assertion")]
enum JsonAssertion {
    #[serde(rename = "status")]
    Status { name: String, expected: u16 },
    #[serde(rename = "statusNot")]
    StatusNot { name: String, expected: u16 },
    #[serde(rename = "statusRange")]
    StatusRange { name: String, min: u16, max: u16 },
    #[serde(rename = "header")]
    Header {
        name: String,
        key: String,
        #[serde(default)]
        expected: Option<String>,
        #[serde(default)]
        includes: Option<String>,
    },
    #[serde(rename = "jsonPath")]
    JsonPath {
        name: String,
        path: String,
        expected: serde_json::Value,
    },
    #[serde(rename = "jsonExists")]
    JsonExists { name: String, path: String },
    #[serde(rename = "jsonNotExists")]
    JsonNotExists { name: String, path: String },
    #[serde(rename = "jsonArrayLength")]
    JsonArrayLength {
        name: String,
        path: String,
        length: usize,
    },
    #[serde(rename = "jsonType")]
    JsonType {
        name: String,
        path: String,
        #[serde(rename = "type")]
        value_type: String,
    },
    #[serde(rename = "bodyContains")]
    BodyContains { name: String, value: String },
    #[serde(rename = "bodyRegex")]
    BodyRegex { name: String, pattern: String },
    #[serde(rename = "responseTime")]
    ResponseTime {
        name: String,
        #[serde(rename = "maxMs")]
        max_ms: u64,
    },
    #[serde(rename = "bodySize")]
    BodySize {
        name: String,
        #[serde(rename = "maxBytes")]
        max_bytes: usize,
    },
}

pub fn run_json_assertions(raw: &str, response: &HttpResponsePayload) -> TestRunResult {
    let assertions: Vec<JsonAssertion> = match serde_json::from_str(raw) {
        Ok(items) => items,
        Err(error) => {
            return single_failure("Invalid JSON assertions", &format!("Parse error: {error}"));
        }
    };
    summarize(assertions.into_iter().map(|assertion| evaluate(assertion, response)).collect())
}

fn find_header(response: &HttpResponsePayload, key: &str) -> Option<String> {
    response
        .headers
        .iter()
        .find(|header| header.key.eq_ignore_ascii_case(key))
        .map(|header| header.value.clone())
}

fn display_value(value: &Option<serde_json::Value>) -> String {
    match value {
        Some(value) => value.to_string(),
        None => "undefined".to_string(),
    }
}

fn json_type_name(value: Option<&serde_json::Value>) -> &'static str {
    match value {
        None => "undefined",
        Some(serde_json::Value::Null) => "null",
        Some(serde_json::Value::Bool(_)) => "boolean",
        Some(serde_json::Value::Number(_)) => "number",
        Some(serde_json::Value::String(_)) => "string",
        Some(serde_json::Value::Array(_)) => "array",
        Some(serde_json::Value::Object(_)) => "object",
    }
}

fn matches_json_type(value: Option<&serde_json::Value>, expected: &str) -> bool {
    json_type_name(value) == expected
}

fn ok_result(name: String, passed: bool, message: Option<String>) -> TestCaseResult {
    TestCaseResult { name, passed, message }
}

fn evaluate(assertion: JsonAssertion, response: &HttpResponsePayload) -> TestCaseResult {
    match assertion {
        JsonAssertion::Status { name, expected } => {
            let passed = response.status == expected;
            ok_result(
                name,
                passed,
                (!passed).then(|| format!("Expected status {expected}, got {}", response.status)),
            )
        }
        JsonAssertion::StatusNot { name, expected } => {
            let passed = response.status != expected;
            ok_result(name, passed, (!passed).then(|| format!("Expected status not to be {expected}")))
        }
        JsonAssertion::StatusRange { name, min, max } => {
            let passed = (min..=max).contains(&response.status);
            ok_result(
                name,
                passed,
                (!passed).then(|| format!("Expected status between {min} and {max}, got {}", response.status)),
            )
        }
        JsonAssertion::Header { name, key, expected, includes } => match find_header(response, &key) {
            None => ok_result(name, false, Some(format!("Header `{key}` not found"))),
            Some(value) => {
                let passed = expected
                    .map(|expected_value| value == expected_value)
                    .unwrap_or_else(|| {
                        includes
                            .map(|needle| value.to_lowercase().contains(&needle.to_lowercase()))
                            .unwrap_or(true)
                    });
                ok_result(name, passed, (!passed).then(|| format!("Header `{key}` was `{value}`")))
            }
        },
        JsonAssertion::JsonPath { name, path, expected } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let actual = crate::json_path::read_json_path(&json, &path);
                let passed = actual.as_ref() == Some(&expected);
                ok_result(
                    name,
                    passed,
                    (!passed).then(|| format!("Expected `{expected}` at `{path}`, got `{}`", display_value(&actual))),
                )
            }
            Err(_) => ok_result(name, false, Some("Response body is not valid JSON".into())),
        },
        JsonAssertion::JsonExists { name, path } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let passed = crate::json_path::read_json_path(&json, &path).is_some();
                ok_result(name, passed, (!passed).then(|| format!("Expected JSON path `{path}` to exist")))
            }
            Err(_) => ok_result(name, false, Some("Response body is not valid JSON".into())),
        },
        JsonAssertion::JsonNotExists { name, path } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let passed = crate::json_path::read_json_path(&json, &path).is_none();
                ok_result(name, passed, (!passed).then(|| format!("Expected JSON path `{path}` not to exist")))
            }
            Err(_) => ok_result(name, false, Some("Response body is not valid JSON".into())),
        },
        JsonAssertion::JsonArrayLength { name, path, length } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let actual_len = crate::json_path::read_json_path(&json, &path)
                    .and_then(|value| value.as_array().map(Vec::len));
                let passed = actual_len == Some(length);
                ok_result(
                    name,
                    passed,
                    (!passed).then(|| {
                        format!(
                            "Expected array length {length} at `{path}`, got `{}`",
                            actual_len.map(|v| v.to_string()).unwrap_or_else(|| "undefined".into())
                        )
                    }),
                )
            }
            Err(_) => ok_result(name, false, Some("Response body is not valid JSON".into())),
        },
        JsonAssertion::JsonType { name, path, value_type } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let actual = crate::json_path::read_json_path(&json, &path);
                let passed = matches_json_type(actual.as_ref(), &value_type);
                ok_result(
                    name,
                    passed,
                    (!passed).then(|| format!("Expected `{path}` to be `{value_type}`, got `{}`", json_type_name(actual.as_ref()))),
                )
            }
            Err(_) => ok_result(name, false, Some("Response body is not valid JSON".into())),
        },
        JsonAssertion::BodyContains { name, value } => {
            let passed = response.body.contains(&value);
            ok_result(name, passed, (!passed).then(|| format!("Response body does not contain `{value}`")))
        }
        JsonAssertion::BodyRegex { name, pattern } => match Regex::new(&pattern) {
            Ok(regex) => {
                let passed = regex.is_match(&response.body);
                ok_result(name, passed, (!passed).then(|| format!("Response body does not match `/{pattern}/`")))
            }
            Err(error) => ok_result(name, false, Some(format!("Invalid regex `/{pattern}/`: {error}"))),
        },
        JsonAssertion::ResponseTime { name, max_ms } => {
            let passed = response.elapsed_ms <= max_ms;
            ok_result(
                name,
                passed,
                (!passed).then(|| format!("Expected response time below {max_ms} ms, got {} ms", response.elapsed_ms)),
            )
        }
        JsonAssertion::BodySize { name, max_bytes } => {
            let passed = response.body.len() <= max_bytes;
            ok_result(
                name,
                passed,
                (!passed).then(|| format!("Expected body size below {max_bytes} B, got {} B", response.body.len())),
            )
        }
    }
}
