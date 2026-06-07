use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

use crate::http::HttpResponsePayload;

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

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "assertion")]
enum JsonAssertion {
    #[serde(rename = "status")]
    Status { name: String, expected: u16 },
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
    #[serde(rename = "bodyContains")]
    BodyContains { name: String, value: String },
    #[serde(rename = "responseTime")]
    ResponseTime {
        name: String,
        #[serde(rename = "maxMs")]
        max_ms: u64,
    },
}

static RE_TEST_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"pulse\.test\("([^"]+)""#).unwrap());
static RE_STATUS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"pulse\.response\.to\.have\.status\((\d+)\)"#).unwrap());
static RE_CODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.expect\(pulse\.response\.code\)\.to\.(?:eql|equal)\((\d+)\)"#).unwrap()
});
static RE_OK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.response\.to\.be\.ok").unwrap());
static RE_HEADER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.response\.to\.have\.header\("([^"]+)"(?:,\s*"([^"]*)")?\)"#).unwrap()
});
static RE_JSON_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.expect\(jsonData\.([^)]+)\)\.to\.(?:eql|equal)\(([^)]+)\)"#).unwrap()
});
static RE_JSON_BRACKET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"pulse\.expect\(jsonData\[['"]([^'"]+)['"]\]\)\.to\.(?:eql|equal)\(([^)]+)\)"#,
    )
    .unwrap()
});
static RE_RESPONSE_TIME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(pulse\.response\.responseTime\)\.to\.be\.below\((\d+)\)").unwrap()
});
static RE_BODY_INCLUDE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"pulse\.expect\(pulse\.response\.text\(\)\)\.to\.(?:include|contain)\("([^"]*)"\)"#,
    )
    .unwrap()
});
static RE_JSON_FIELD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"pulse\.expect\(pulse\.response\.json\(\)\.([^)]+)\)\.to\.(?:eql|equal)\(([^)]+)\)"#,
    )
    .unwrap()
});

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

    run_script_tests(trimmed, response)
}

fn normalize_test_script(script: &str) -> String {
    script.replace("pm.", "pulse.")
}

fn run_script_tests(script: &str, response: &HttpResponsePayload) -> TestRunResult {
    let script = normalize_test_script(script);
    let json_body = serde_json::from_str::<serde_json::Value>(&response.body).ok();

    let results: Vec<TestCaseResult> = script
        .split("pulse.test(")
        .skip(1)
        .map(|block| evaluate_test_block(block, response, json_body.as_ref()))
        .collect();

    if results.is_empty() {
        return single_failure(
            "No tests found",
            "Use pulse.test(...) blocks or a JSON assertions array.",
        );
    }

    summarize(results)
}

fn run_json_assertions(raw: &str, response: &HttpResponsePayload) -> TestRunResult {
    let assertions: Vec<JsonAssertion> = match serde_json::from_str(raw) {
        Ok(items) => items,
        Err(error) => {
            return single_failure("Invalid JSON assertions", &format!("Parse error: {error}"));
        }
    };

    let results = assertions
        .into_iter()
        .map(|assertion| evaluate_json_assertion(assertion, response))
        .collect();

    summarize(results)
}

fn evaluate_test_block(
    block: &str,
    response: &HttpResponsePayload,
    json_body: Option<&serde_json::Value>,
) -> TestCaseResult {
    let name = RE_TEST_NAME
        .captures(&format!("pulse.test({block}"))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "Unnamed test".to_string());

    let mut failures: Vec<String> = Vec::new();
    let mut assertion_count = 0;

    for caps in RE_STATUS.captures_iter(block) {
        assertion_count += 1;
        let expected: u16 = caps[1].parse().unwrap_or(0);
        if response.status != expected {
            failures.push(format!("Expected status {expected}, got {}", response.status));
        }
    }

    if RE_OK.is_match(block) {
        assertion_count += 1;
        if !(200..300).contains(&response.status) {
            failures.push(format!("Expected 2xx status, got {}", response.status));
        }
    }

    for caps in RE_CODE.captures_iter(block) {
        assertion_count += 1;
        let expected: u16 = caps[1].parse().unwrap_or(0);
        if response.status != expected {
            failures.push(format!("Expected status {expected}, got {}", response.status));
        }
    }

    for caps in RE_HEADER.captures_iter(block) {
        assertion_count += 1;
        let key = caps[1].to_string();
        let expected = caps.get(2).map(|m| m.as_str().to_string());
        match find_header(response, &key) {
            None => failures.push(format!("Header `{key}` not found")),
            Some(value) => {
                if let Some(expected_value) = expected {
                    if value != expected_value {
                        failures.push(format!(
                            "Header `{key}` expected `{expected_value}`, got `{value}`"
                        ));
                    }
                }
            }
        }
    }

    for caps in RE_RESPONSE_TIME.captures_iter(block) {
        assertion_count += 1;
        let max_ms: u64 = caps[1].parse().unwrap_or(0);
        if response.elapsed_ms > max_ms {
            failures.push(format!(
                "Expected response time below {max_ms} ms, got {} ms",
                response.elapsed_ms
            ));
        }
    }

    for caps in RE_BODY_INCLUDE.captures_iter(block) {
        assertion_count += 1;
        let needle = caps[1].to_string();
        if !response.body.contains(&needle) {
            failures.push(format!("Response body does not contain `{needle}`"));
        }
    }

    if let Some(json) = json_body {
        for caps in RE_JSON_PATH.captures_iter(block) {
            assertion_count += 1;
            let path = normalize_json_path(&caps[1]);
            let expected = parse_literal(caps[2].trim());
            check_json_path(json, &path, expected, &mut failures);
        }

        for caps in RE_JSON_BRACKET.captures_iter(block) {
            assertion_count += 1;
            let path = caps[1].to_string();
            let expected = parse_literal(caps[2].trim());
            check_json_path(json, &path, expected, &mut failures);
        }

        for caps in RE_JSON_FIELD.captures_iter(block) {
            assertion_count += 1;
            let path = normalize_json_path(&caps[1]);
            let expected = parse_literal(caps[2].trim());
            check_json_path(json, &path, expected, &mut failures);
        }
    } else if RE_JSON_PATH.is_match(block)
        || RE_JSON_BRACKET.is_match(block)
        || RE_JSON_FIELD.is_match(block)
    {
        assertion_count += 1;
        failures.push("Response body is not valid JSON".to_string());
    }

    if assertion_count == 0 {
        failures.push("No supported assertions found in this test block".to_string());
    }

    TestCaseResult {
        name,
        passed: failures.is_empty(),
        message: if failures.is_empty() {
            None
        } else {
            Some(failures.join(" · "))
        },
    }
}

fn check_json_path(
    json: &serde_json::Value,
    path: &str,
    expected: Option<serde_json::Value>,
    failures: &mut Vec<String>,
) {
    let actual = read_json_path(json, path);
    if actual != expected {
        failures.push(format!(
            "Expected `{}` at `{path}`, got `{}`",
            expected
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_else(|| "undefined".to_string()),
            actual
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_else(|| "undefined".to_string())
        ));
    }
}

fn normalize_json_path(raw: &str) -> String {
    raw.replace(['(', ')'], "").trim().to_string()
}

fn evaluate_json_assertion(
    assertion: JsonAssertion,
    response: &HttpResponsePayload,
) -> TestCaseResult {
    match assertion {
        JsonAssertion::Status { name, expected } => {
            let passed = response.status == expected;
            TestCaseResult {
                name,
                passed,
                message: if passed {
                    None
                } else {
                    Some(format!("Expected status {expected}, got {}", response.status))
                },
            }
        }
        JsonAssertion::StatusRange { name, min, max } => {
            let passed = response.status >= min && response.status <= max;
            TestCaseResult {
                name,
                passed,
                message: if passed {
                    None
                } else {
                    Some(format!(
                        "Expected status between {min} and {max}, got {}",
                        response.status
                    ))
                },
            }
        }
        JsonAssertion::Header {
            name,
            key,
            expected,
            includes,
        } => match find_header(response, &key) {
            None => TestCaseResult {
                name,
                passed: false,
                message: Some(format!("Header `{key}` not found")),
            },
            Some(value) => {
                let passed = expected
                    .map(|expected_value| value == expected_value)
                    .unwrap_or_else(|| {
                        includes
                            .map(|needle| value.to_lowercase().contains(&needle.to_lowercase()))
                            .unwrap_or(true)
                    });
                TestCaseResult {
                    name,
                    passed,
                    message: if passed {
                        None
                    } else {
                        Some(format!("Header `{key}` was `{value}`"))
                    },
                }
            }
        },
        JsonAssertion::JsonPath {
            name,
            path,
            expected,
        } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let actual = read_json_path(&json, &path);
                let passed = actual.as_ref() == Some(&expected);
                TestCaseResult {
                    name,
                    passed,
                    message: if passed {
                        None
                    } else {
                        Some(format!(
                            "Expected `{expected}` at `{path}`, got `{}`",
                            actual
                                .map(|v| v.to_string())
                                .unwrap_or_else(|| "undefined".to_string())
                        ))
                    },
                }
            }
            Err(_) => TestCaseResult {
                name,
                passed: false,
                message: Some("Response body is not valid JSON".to_string()),
            },
        },
        JsonAssertion::BodyContains { name, value } => {
            let passed = response.body.contains(&value);
            TestCaseResult {
                name,
                passed,
                message: if passed {
                    None
                } else {
                    Some(format!("Response body does not contain `{value}`"))
                },
            }
        }
        JsonAssertion::ResponseTime { name, max_ms } => {
            let passed = response.elapsed_ms <= max_ms;
            TestCaseResult {
                name,
                passed,
                message: if passed {
                    None
                } else {
                    Some(format!(
                        "Expected response time below {max_ms} ms, got {} ms",
                        response.elapsed_ms
                    ))
                },
            }
        }
    }
}

fn find_header(response: &HttpResponsePayload, key: &str) -> Option<String> {
    response
        .headers
        .iter()
        .find(|header| header.key.eq_ignore_ascii_case(key))
        .map(|header| header.value.clone())
}

pub fn read_json_path(value: &serde_json::Value, path: &str) -> Option<serde_json::Value> {
    let mut current = value;
    for segment in path.split('.').filter(|part| !part.is_empty()) {
        current = match current {
            serde_json::Value::Object(map) => map.get(segment)?,
            serde_json::Value::Array(items) => {
                let index: usize = segment.parse().ok()?;
                items.get(index)?
            }
            _ => return None,
        };
    }
    Some(current.clone())
}

fn parse_literal(raw: &str) -> Option<serde_json::Value> {
    let trimmed = raw.trim();
    if trimmed == "undefined" || trimmed == "null" {
        return Some(serde_json::Value::Null);
    }
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        return Some(serde_json::Value::String(
            trimmed.trim_matches(['"', '\'']).to_string(),
        ));
    }
    if trimmed == "true" {
        return Some(serde_json::Value::Bool(true));
    }
    if trimmed == "false" {
        return Some(serde_json::Value::Bool(false));
    }
    if let Ok(number) = trimmed.parse::<i64>() {
        return Some(serde_json::Value::Number(number.into()));
    }
    if let Ok(number) = trimmed.parse::<f64>() {
        return serde_json::Number::from_f64(number).map(serde_json::Value::Number);
    }
    serde_json::from_str(trimmed).ok()
}

fn summarize(results: Vec<TestCaseResult>) -> TestRunResult {
    let passed = results.iter().filter(|item| item.passed).count() as u32;
    let failed = results.len() as u32 - passed;
    TestRunResult {
        passed,
        failed,
        total: results.len() as u32,
        results,
    }
}

fn single_failure(name: &str, message: &str) -> TestRunResult {
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

#[cfg(test)]
#[path = "__tests__/test_runner_tests.rs"]
mod tests;
