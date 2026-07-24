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

static RE_TEST_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"pulse\.test\("([^"]+)""#).unwrap());
static RE_STATUS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"pulse\.response\.to\.have\.status\((\d+)\)"#).unwrap());
static RE_STATUS_NOT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.response\.to\.not\.have\.status\((\d+)\)"#).unwrap()
});
static RE_CODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.expect\(pulse\.response\.code\)\.to\.(?:eql|equal)\((\d+)\)"#).unwrap()
});
static RE_OK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.response\.to\.be\.ok").unwrap());
static RE_CLIENT_ERROR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.response\.to\.be\.clientError").unwrap());
static RE_SERVER_ERROR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.response\.to\.be\.serverError").unwrap());
static RE_REDIRECT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.response\.to\.be\.redirect").unwrap());
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
static RE_JSON_FALLBACK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.expect\((jsonData\.[^{}]+?\s*\|\|\s*\[[^\]]*\])\)\.to\.(?:eql|equal)\(([^)]+)\)"#)
        .unwrap()
});
static RE_RESPONSE_TIME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(pulse\.response\.responseTime\)\.to\.be\.below\((\d+)\)").unwrap()
});
static RE_BODY_SIZE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(pulse\.response\.size\(\)\)\.to\.be\.below\((\d+)\)").unwrap()
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
static RE_HEADER_INCLUDE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"pulse\.expect\(pulse\.response\.headers\.get\("([^"]+)"\)\)\.to\.include\("([^"]*)"\)"#,
    )
    .unwrap()
});
static RE_EXPECT_BELOW: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.below\(([^)]+)\)").unwrap()
});
static RE_EXPECT_ABOVE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.above\(([^)]+)\)").unwrap()
});
static RE_EXPECT_AT_LEAST: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.at\.least\(([^)]+)\)").unwrap()
});
static RE_EXPECT_AT_MOST: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.at\.most\(([^)]+)\)").unwrap()
});
static RE_EXPECT_EQL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.(?:eql|equal|deep\.equal)\(([^)]+)\)").unwrap()
});
static RE_EXPECT_NOT_EQL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.not\.(?:eql|equal)\(([^)]+)\)").unwrap()
});
static RE_EXPECT_INCLUDE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.expect\(([^)]+)\)\.to\.include\(([^)]+)\)"#).unwrap()
});
static RE_EXPECT_TRUE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.true").unwrap());
static RE_EXPECT_FALSE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.false").unwrap());
static RE_EXPECT_NULL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.null").unwrap());
static RE_EXPECT_UNDEFINED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.undefined").unwrap());
static RE_EXPECT_EMPTY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.be\.empty").unwrap());
static RE_EXPECT_NOT_EMPTY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.not\.be\.empty").unwrap());
static RE_EXPECT_LENGTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"pulse\.expect\(([^)]+)\)\.to\.have\.lengthOf\((\d+)\)").unwrap()
});
static RE_EXPECT_PROPERTY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"pulse\.expect\(([^)]+)\)\.to\.have\.property\(['"]([^'"]+)['"](?:,\s*([^)]+))?\)"#,
    )
    .unwrap()
});
static RE_EXPECT_AN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.expect\(([^)]+)\)\.to\.be\.an?\(['"](\w+)['"]\)"#).unwrap()
});
static RE_BODY_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"pulse\.expect\(pulse\.response\.text\(\)\)\.to\.match\(/([^/]+)/\)"#).unwrap()
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

    for caps in RE_STATUS_NOT.captures_iter(block) {
        assertion_count += 1;
        let unexpected: u16 = caps[1].parse().unwrap_or(0);
        if response.status == unexpected {
            failures.push(format!("Expected status not to be {unexpected}"));
        }
    }

    if RE_OK.is_match(block) {
        assertion_count += 1;
        if !(200..300).contains(&response.status) {
            failures.push(format!("Expected 2xx status, got {}", response.status));
        }
    }

    if RE_CLIENT_ERROR.is_match(block) {
        assertion_count += 1;
        if !(400..500).contains(&response.status) {
            failures.push(format!("Expected 4xx client error, got {}", response.status));
        }
    }

    if RE_SERVER_ERROR.is_match(block) {
        assertion_count += 1;
        if !(500..600).contains(&response.status) {
            failures.push(format!("Expected 5xx server error, got {}", response.status));
        }
    }

    if RE_REDIRECT.is_match(block) {
        assertion_count += 1;
        if !(300..400).contains(&response.status) {
            failures.push(format!("Expected 3xx redirect, got {}", response.status));
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
                    if !value.to_lowercase().contains(&expected_value.to_lowercase()) {
                        failures.push(format!(
                            "Header `{key}` expected to include `{expected_value}`, got `{value}`"
                        ));
                    }
                }
            }
        }
    }

    for caps in RE_HEADER_INCLUDE.captures_iter(block) {
        assertion_count += 1;
        let key = caps[1].to_string();
        let needle = caps[2].to_string();
        match find_header(response, &key) {
            None => failures.push(format!("Header `{key}` not found")),
            Some(value) if !value.to_lowercase().contains(&needle.to_lowercase()) => {
                failures.push(format!(
                    "Header `{key}` expected to include `{needle}`, got `{value}`"
                ));
            }
            _ => {}
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

    for caps in RE_BODY_SIZE.captures_iter(block) {
        assertion_count += 1;
        let max_bytes: usize = caps[1].parse().unwrap_or(0);
        if response.body.len() > max_bytes {
            failures.push(format!(
                "Expected body size below {max_bytes} B, got {} B",
                response.body.len()
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

    for caps in RE_BODY_REGEX.captures_iter(block) {
        assertion_count += 1;
        let pattern = caps[1].to_string();
        match Regex::new(&pattern) {
            Ok(regex) if !regex.is_match(&response.body) => {
                failures.push(format!("Response body does not match `/{pattern}/`"));
            }
            Err(error) => failures.push(format!("Invalid regex `/{pattern}/`: {error}")),
            _ => {}
        }
    }

    if let Some(json) = json_body {
        for caps in RE_JSON_PATH.captures_iter(block) {
            if caps[1].contains("||") {
                continue;
            }
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

        for caps in RE_JSON_FALLBACK.captures_iter(block) {
            assertion_count += 1;
            let expr = caps[1].trim();
            let expected = parse_literal(caps[2].trim());
            let actual = resolve_expression(expr, response, Some(json));
            if actual != expected {
                failures.push(format!(
                    "Expected `{}`, got `{}`",
                    display_value(&expected),
                    display_value(&actual)
                ));
            }
        }
    } else if RE_JSON_PATH.is_match(block)
        || RE_JSON_BRACKET.is_match(block)
        || RE_JSON_FIELD.is_match(block)
        || RE_JSON_FALLBACK.is_match(block)
    {
        assertion_count += 1;
        failures.push("Response body is not valid JSON".to_string());
    }

    assertion_count += evaluate_expect_assertions(block, response, json_body, &mut failures);

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

fn evaluate_expect_assertions(
    block: &str,
    response: &HttpResponsePayload,
    json_body: Option<&serde_json::Value>,
    failures: &mut Vec<String>,
) -> u32 {
    let mut count = 0;

    for caps in RE_EXPECT_BELOW.captures_iter(block) {
        if caps[1].contains("pulse.response.responseTime") || caps[1].contains("pulse.response.size()") {
            continue;
        }
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let limit = parse_number(&caps[2]);
        compare_numbers(actual, limit, Comparison::Below, failures);
    }

    for caps in RE_EXPECT_ABOVE.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let limit = parse_number(&caps[2]);
        compare_numbers(actual, limit, Comparison::Above, failures);
    }

    for caps in RE_EXPECT_AT_LEAST.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let limit = parse_number(&caps[2]);
        compare_numbers(actual, limit, Comparison::AtLeast, failures);
    }

    for caps in RE_EXPECT_AT_MOST.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let limit = parse_number(&caps[2]);
        compare_numbers(actual, limit, Comparison::AtMost, failures);
    }

    for caps in RE_EXPECT_EQL.captures_iter(block) {
        if caps[1].starts_with("jsonData")
            || caps[1].contains("pulse.response.text()")
            || caps[1].contains("pulse.response.json()")
        {
            continue;
        }
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let expected = parse_literal(caps[2].trim());
        if actual != expected {
            failures.push(format!(
                "Expected `{}`, got `{}`",
                display_value(&expected),
                display_value(&actual)
            ));
        }
    }

    for caps in RE_EXPECT_NOT_EQL.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let expected = parse_literal(caps[2].trim());
        if actual == expected {
            failures.push(format!("Expected value not to equal `{}`", display_value(&expected)));
        }
    }

    for caps in RE_EXPECT_INCLUDE.captures_iter(block) {
        if caps[1].contains("pulse.response.text()") {
            continue;
        }
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let needle = parse_literal(caps[2].trim()).and_then(|v| v.as_str().map(str::to_string));
        let haystack = value_to_string(actual);
        match (haystack, needle) {
            (Some(h), Some(n)) if !h.contains(&n) => {
                failures.push(format!("Expected `{h}` to include `{n}`"));
            }
            (None, _) => failures.push("Expected a string value to include substring".to_string()),
            _ => {}
        }
    }

    for caps in RE_EXPECT_TRUE.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        if actual != Some(serde_json::Value::Bool(true)) {
            failures.push(format!(
                "Expected true, got `{}`",
                display_value(&actual)
            ));
        }
    }

    for caps in RE_EXPECT_FALSE.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        if actual != Some(serde_json::Value::Bool(false)) {
            failures.push(format!(
                "Expected false, got `{}`",
                display_value(&actual)
            ));
        }
    }

    for caps in RE_EXPECT_NULL.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        if actual != Some(serde_json::Value::Null) {
            failures.push(format!(
                "Expected null, got `{}`",
                display_value(&actual)
            ));
        }
    }

    for caps in RE_EXPECT_UNDEFINED.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        if actual.is_some() {
            failures.push(format!(
                "Expected undefined, got `{}`",
                display_value(&actual)
            ));
        }
    }

    for caps in RE_EXPECT_EMPTY.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        if !is_empty_value(actual.as_ref()) {
            failures.push(format!(
                "Expected empty value, got `{}`",
                display_value(&actual)
            ));
        }
    }

    for caps in RE_EXPECT_NOT_EMPTY.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        if is_empty_value(actual.as_ref()) {
            failures.push("Expected non-empty value".to_string());
        }
    }

    for caps in RE_EXPECT_LENGTH.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let expected: usize = caps[2].parse().unwrap_or(0);
        let length = value_length(actual.as_ref());
        if length != expected {
            failures.push(format!("Expected length {expected}, got {length}"));
        }
    }

    for caps in RE_EXPECT_PROPERTY.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let key = caps[2].to_string();
        let expected = caps.get(3).map(|m| parse_literal(m.as_str().trim()));
        match actual {
            Some(serde_json::Value::Object(map)) => match map.get(&key) {
                None => failures.push(format!("Expected property `{key}` to exist")),
                Some(value) => {
                    if let Some(expected_value) = expected.flatten() {
                        if value != &expected_value {
                            failures.push(format!(
                                "Expected property `{key}` to equal `{}`, got `{value}`",
                                expected_value
                            ));
                        }
                    }
                }
            },
            _ => failures.push("Expected an object with properties".to_string()),
        }
    }

    for caps in RE_EXPECT_AN.captures_iter(block) {
        count += 1;
        let actual = resolve_expression(&caps[1], response, json_body);
        let expected_type = caps[2].to_string();
        if !matches_json_type(actual.as_ref(), &expected_type) {
            failures.push(format!(
                "Expected type `{expected_type}`, got `{}`",
                json_type_name(actual.as_ref())
            ));
        }
    }

    count
}

#[derive(Copy, Clone)]
enum Comparison {
    Below,
    Above,
    AtLeast,
    AtMost,
}

fn compare_numbers(
    actual: Option<serde_json::Value>,
    limit: Option<f64>,
    comparison: Comparison,
    failures: &mut Vec<String>,
) {
    let (Some(actual_number), Some(limit)) = (value_to_number(actual.as_ref()), limit) else {
        failures.push("Expected numeric values for comparison".to_string());
        return;
    };

    let failed = match comparison {
        Comparison::Below => actual_number >= limit,
        Comparison::Above => actual_number <= limit,
        Comparison::AtLeast => actual_number < limit,
        Comparison::AtMost => actual_number > limit,
    };

    if failed {
        let op = match comparison {
            Comparison::Below => "below",
            Comparison::Above => "above",
            Comparison::AtLeast => "at least",
            Comparison::AtMost => "at most",
        };
        failures.push(format!(
            "Expected {actual_number} to be {op} {limit}"
        ));
    }
}

fn resolve_expression(
    expr: &str,
    response: &HttpResponsePayload,
    json_body: Option<&serde_json::Value>,
) -> Option<serde_json::Value> {
    let expr = expr.trim();

    if let Some((left, right)) = split_fallback(expr) {
        let left_value = resolve_expression(left, response, json_body);
        if left_value.is_none() || left_value == Some(serde_json::Value::Null) {
            return parse_literal(right);
        }
        return left_value;
    }

    match expr {
        "pulse.response.responseTime" => Some(serde_json::Value::Number(response.elapsed_ms.into())),
        "pulse.response.code" => Some(serde_json::Value::Number(response.status.into())),
        "pulse.response.text()" => Some(serde_json::Value::String(response.body.clone())),
        "pulse.response.size()" => Some(serde_json::Value::Number(response.body.len().into())),
        "pulse.response.json()" => json_body.cloned(),
        _ if expr.starts_with("jsonData.") => {
            let path = expr.trim_start_matches("jsonData.");
            json_body.and_then(|json| read_json_path(json, path))
        }
        _ if expr.starts_with("jsonData[") => {
            let path = expr.trim_start_matches("jsonData");
            json_body.and_then(|json| read_json_path(json, path.trim_start_matches('[').trim_end_matches(']').trim_matches(['\'', '"'])))
        }
        _ => parse_literal(expr),
    }
}

fn split_fallback<'a>(expr: &'a str) -> Option<(&'a str, &'a str)> {
    let mut depth: usize = 0;
    for (index, ch) in expr.char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => depth = depth.saturating_sub(1),
            '|' if depth == 0 && expr[index..].starts_with("||") => {
                let left = expr[..index].trim();
                let right = expr[index + 2..].trim();
                return Some((left, right));
            }
            _ => {}
        }
    }
    None
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
            display_value(&expected),
            display_value(&actual)
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
        JsonAssertion::StatusNot { name, expected } => {
            let passed = response.status != expected;
            TestCaseResult {
                name,
                passed,
                message: if passed {
                    None
                } else {
                    Some(format!("Expected status not to be {expected}"))
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
                            display_value(&actual)
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
        JsonAssertion::JsonExists { name, path } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let passed = read_json_path(&json, &path).is_some();
                TestCaseResult {
                    name,
                    passed,
                    message: if passed {
                        None
                    } else {
                        Some(format!("Expected JSON path `{path}` to exist"))
                    },
                }
            }
            Err(_) => TestCaseResult {
                name,
                passed: false,
                message: Some("Response body is not valid JSON".to_string()),
            },
        },
        JsonAssertion::JsonNotExists { name, path } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let passed = read_json_path(&json, &path).is_none();
                TestCaseResult {
                    name,
                    passed,
                    message: if passed {
                        None
                    } else {
                        Some(format!("Expected JSON path `{path}` not to exist"))
                    },
                }
            }
            Err(_) => TestCaseResult {
                name,
                passed: false,
                message: Some("Response body is not valid JSON".to_string()),
            },
        },
        JsonAssertion::JsonArrayLength { name, path, length } => {
            match serde_json::from_str::<serde_json::Value>(&response.body) {
                Ok(json) => {
                    let actual_len = read_json_path(&json, &path)
                        .and_then(|value| value.as_array().map(|items| items.len()));
                    let passed = actual_len == Some(length);
                    TestCaseResult {
                        name,
                        passed,
                        message: if passed {
                            None
                        } else {
                            Some(format!(
                                "Expected array length {length} at `{path}`, got `{}`",
                                actual_len
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
            }
        }
        JsonAssertion::JsonType {
            name,
            path,
            value_type,
        } => match serde_json::from_str::<serde_json::Value>(&response.body) {
            Ok(json) => {
                let actual = read_json_path(&json, &path);
                let passed = matches_json_type(actual.as_ref(), &value_type);
                TestCaseResult {
                    name,
                    passed,
                    message: if passed {
                        None
                    } else {
                        Some(format!(
                            "Expected `{path}` to be `{value_type}`, got `{}`",
                            json_type_name(actual.as_ref())
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
        JsonAssertion::BodyRegex { name, pattern } => match Regex::new(&pattern) {
            Ok(regex) => {
                let passed = regex.is_match(&response.body);
                TestCaseResult {
                    name,
                    passed,
                    message: if passed {
                        None
                    } else {
                        Some(format!("Response body does not match `/{pattern}/`"))
                    },
                }
            }
            Err(error) => TestCaseResult {
                name,
                passed: false,
                message: Some(format!("Invalid regex `/{pattern}/`: {error}")),
            },
        },
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
        JsonAssertion::BodySize { name, max_bytes } => {
            let passed = response.body.len() <= max_bytes;
            TestCaseResult {
                name,
                passed,
                message: if passed {
                    None
                } else {
                    Some(format!(
                        "Expected body size below {max_bytes} B, got {} B",
                        response.body.len()
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
    let mut rest = path.trim();

    while !rest.is_empty() {
        if let Some(dot_index) = rest.find('.') {
            let segment = &rest[..dot_index];
            rest = &rest[dot_index + 1..];
            current = descend_segment(current, segment)?;
        } else {
            current = descend_segment(current, rest)?;
            break;
        }
    }

    Some(current.clone())
}

fn descend_segment<'a>(current: &'a serde_json::Value, segment: &str) -> Option<&'a serde_json::Value> {
    let mut value = current;
    let mut part = segment;

    while !part.is_empty() {
        if let Some(bracket_index) = part.find('[') {
            let key = part[..bracket_index].trim();
            if !key.is_empty() {
                value = value.get(key)?;
            }
            let closing = part[bracket_index..].find(']')?;
            let index_str = part[bracket_index + 1..bracket_index + closing].trim();
            let index: usize = index_str.parse().ok()?;
            value = value.get(index)?;
            part = part[bracket_index + closing + 1..].trim_start_matches('.');
        } else {
            return value.get(part);
        }
    }

    Some(value)
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

static RE_ENV_SET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"pulse\.(?:environment|variables)\.set\(\s*["']([^"']+)["']\s*,\s*([^)]+?)\s*\)"#,
    )
    .unwrap()
});

pub fn run_pre_request_script(script: &str) -> PreRequestResult {
    let normalized = normalize_test_script(script);
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return PreRequestResult {
            mutations: Vec::new(),
        };
    }

    let mut mutations = Vec::new();
    for capture in RE_ENV_SET.captures_iter(&normalized) {
        let key = capture.get(1).map(|m| m.as_str().trim()).unwrap_or("");
        let raw_value = capture.get(2).map(|m| m.as_str().trim()).unwrap_or("");
        if key.is_empty() {
            continue;
        }
        let value = parse_literal(raw_value)
            .map(|v| match v {
                serde_json::Value::String(s) => s,
                serde_json::Value::Null => String::new(),
                other => other.to_string(),
            })
            .unwrap_or_else(|| raw_value.trim_matches(['"', '\'']).to_string());
        mutations.retain(|item: &EnvMutation| item.key != key);
        mutations.push(EnvMutation {
            key: key.to_string(),
            value,
        });
    }

    PreRequestResult { mutations }
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
    if trimmed == "[]" {
        return Some(serde_json::Value::Array(Vec::new()));
    }
    if trimmed == "{}" {
        return Some(serde_json::Value::Object(serde_json::Map::new()));
    }
    serde_json::from_str(trimmed).ok()
}

fn parse_number(raw: &str) -> Option<f64> {
    parse_literal(raw).as_ref().and_then(|value| value_to_number(Some(value)))
}

fn value_to_number(value: Option<&serde_json::Value>) -> Option<f64> {
    match value {
        Some(serde_json::Value::Number(number)) => number.as_f64(),
        Some(serde_json::Value::String(text)) => text.parse().ok(),
        _ => None,
    }
}

fn value_to_string(value: Option<serde_json::Value>) -> Option<String> {
    match value {
        Some(serde_json::Value::String(text)) => Some(text),
        Some(other) => Some(other.to_string()),
        None => None,
    }
}

fn value_length(value: Option<&serde_json::Value>) -> usize {
    match value {
        Some(serde_json::Value::String(text)) => text.len(),
        Some(serde_json::Value::Array(items)) => items.len(),
        Some(serde_json::Value::Object(map)) => map.len(),
        None => 0,
        _ => 1,
    }
}

fn is_empty_value(value: Option<&serde_json::Value>) -> bool {
    match value {
        None => true,
        Some(serde_json::Value::Null) => true,
        Some(serde_json::Value::String(text)) => text.is_empty(),
        Some(serde_json::Value::Array(items)) => items.is_empty(),
        Some(serde_json::Value::Object(map)) => map.is_empty(),
        _ => false,
    }
}

fn matches_json_type(value: Option<&serde_json::Value>, expected: &str) -> bool {
    match (value, expected) {
        (None, "undefined") => true,
        (Some(serde_json::Value::Null), "null") => true,
        (Some(serde_json::Value::Bool(_)), "boolean") => true,
        (Some(serde_json::Value::Number(_)), "number") => true,
        (Some(serde_json::Value::String(_)), "string") => true,
        (Some(serde_json::Value::Array(_)), "array") => true,
        (Some(serde_json::Value::Object(_)), "object") => true,
        _ => false,
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

fn display_value(value: &Option<serde_json::Value>) -> String {
    value
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "undefined".to_string())
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
