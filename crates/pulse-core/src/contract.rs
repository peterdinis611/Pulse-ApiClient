//! Contract helpers: JSON Schema subset diff vs a previous 2xx snapshot.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::workspace_fs::YamlRequestFile;

#[derive(Debug, Clone)]
pub struct ContractReport {
    pub ok: bool,
    pub errors: Vec<String>,
}

pub fn compare_to_schema(body: &str, schema: &Value) -> ContractReport {
    let instance: Value = match serde_json::from_str(body) {
        Ok(value) => value,
        Err(_) => {
            return ContractReport {
                ok: false,
                errors: vec!["body is not JSON".into()],
            };
        }
    };
    let errors = validate_schema(&instance, schema, "$");
    ContractReport {
        ok: errors.is_empty(),
        errors,
    }
}

fn validate_schema(instance: &Value, schema: &Value, path: &str) -> Vec<String> {
    let mut errors = Vec::new();
    let Some(schema_obj) = schema.as_object() else {
        return errors;
    };
    if let Some(expected) = schema_obj.get("type").and_then(|v| v.as_str()) {
        if json_type(instance) != expected
            && !(expected == "number" && json_type(instance) == "integer")
            && !(expected == "integer" && instance.as_i64().is_some())
        {
            errors.push(format!("{path}: expected {expected}, got {}", json_type(instance)));
            return errors;
        }
    }
    if let Some(obj) = instance.as_object() {
        if let Some(required) = schema_obj.get("required").and_then(|v| v.as_array()) {
            for key in required.iter().filter_map(|v| v.as_str()) {
                if !obj.contains_key(key) {
                    errors.push(format!("{path}: missing required property {key}"));
                }
            }
        }
        if let Some(properties) = schema_obj.get("properties").and_then(|v| v.as_object()) {
            for (key, child) in properties {
                if let Some(value) = obj.get(key) {
                    errors.extend(validate_schema(value, child, &format!("{path}.{key}")));
                }
            }
        }
    }
    errors
}

/// Breaking if required keys disappear or types change on shared paths.
pub fn breaking_diff(previous: &Value, current: &Value) -> Vec<String> {
    let mut errors = Vec::new();
    walk("$", previous, current, &mut errors);
    errors
}

fn walk(path: &str, previous: &Value, current: &Value, errors: &mut Vec<String>) {
    match (previous, current) {
        (Value::Object(left), Value::Object(right)) => {
            for (key, left_value) in left {
                match right.get(key) {
                    None => errors.push(format!("{path}.{key}: removed")),
                    Some(right_value) => walk(&format!("{path}.{key}"), left_value, right_value, errors),
                }
            }
        }
        (Value::Array(left), Value::Array(right)) => {
            if let (Some(left_item), Some(right_item)) = (left.first(), right.first()) {
                walk(&format!("{path}[]"), left_item, right_item, errors);
            }
        }
        (left, right) if json_type(left) != json_type(right) => {
            errors.push(format!(
                "{path}: type changed from {} to {}",
                json_type(left),
                json_type(right)
            ));
        }
        _ => {}
    }
}

/// Validate saved examples against `responseSchema` and optional `*.previous.json` snapshots.
pub fn check_workspace(root: &str) -> Result<ContractReport, String> {
    let dir = Path::new(root);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }
    let mut errors = Vec::new();
    walk_yaml(dir, &mut errors);
    Ok(ContractReport {
        ok: errors.is_empty(),
        errors,
    })
}

fn walk_yaml(dir: &Path, errors: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().and_then(|n| n.to_str()) == Some(".git") {
                continue;
            }
            walk_yaml(&path, errors);
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.ends_with(".pulse.yaml") && !name.ends_with(".pulse.yml") {
            continue;
        }
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) => {
                errors.push(format!("{}: {error}", path.display()));
                continue;
            }
        };
        let file: YamlRequestFile = match serde_yaml::from_str(&text) {
            Ok(file) => file,
            Err(error) => {
                errors.push(format!("{}: {error}", path.display()));
                continue;
            }
        };
        let bodies = example_bodies(&file);
        if !bodies.is_empty() && !file.response_schema.trim().is_empty() {
            let schema: Value = match serde_json::from_str(file.response_schema.trim()) {
                Ok(value) => value,
                Err(error) => {
                    errors.push(format!("{}: invalid responseSchema ({error})", path.display()));
                    continue;
                }
            };
            for (label, body) in &bodies {
                let report = compare_to_schema(body.trim(), &schema);
                for error in report.errors {
                    errors.push(format!("{} ({label}): {error}", path.display()));
                }
            }
        }
        let snapshot = path.with_file_name(format!(
            "{}.previous.json",
            name.trim_end_matches(".pulse.yaml")
                .trim_end_matches(".pulse.yml")
        ));
        let snapshot_body = if !file.example.trim().is_empty() {
            file.example.clone()
        } else {
            bodies.first().map(|(_, body)| body.clone()).unwrap_or_default()
        };
        if snapshot.is_file() && !snapshot_body.trim().is_empty() {
            let previous_raw = match fs::read_to_string(&snapshot) {
                Ok(text) => text,
                Err(error) => {
                    errors.push(format!("{}: {error}", snapshot.display()));
                    continue;
                }
            };
            let previous: Value = match serde_json::from_str(previous_raw.trim()) {
                Ok(value) => value,
                Err(error) => {
                    errors.push(format!("{}: invalid JSON ({error})", snapshot.display()));
                    continue;
                }
            };
            let current: Value = match serde_json::from_str(snapshot_body.trim()) {
                Ok(value) => value,
                Err(error) => {
                    errors.push(format!("{}: example is not JSON ({error})", path.display()));
                    continue;
                }
            };
            for error in breaking_diff(&previous, &current) {
                errors.push(format!("{}: {error}", path.display()));
            }
        }
    }
}

fn example_bodies(file: &YamlRequestFile) -> Vec<(String, String)> {
    if !file.examples.is_empty() {
        return file
            .examples
            .iter()
            .filter(|item| {
                let status = if item.status == 0 { 200 } else { item.status };
                (200..300).contains(&status) && !item.body.trim().is_empty()
            })
            .map(|item| {
                let name = if item.name.trim().is_empty() {
                    "example".into()
                } else {
                    item.name.clone()
                };
                (name, item.body.clone())
            })
            .collect();
    }
    if file.example.trim().is_empty() {
        return Vec::new();
    }
    vec![("example".into(), file.example.clone())]
}

fn json_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_removed_field() {
        let errors = breaking_diff(&json!({"id": 1, "name": "a"}), &json!({"id": 1}));
        assert!(errors.iter().any(|item| item.contains("name")));
    }

    #[test]
    fn workspace_fixture_passes_contracts() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../python/examples/git-workspace");
        let report = check_workspace(root.to_str().unwrap()).expect("fixture");
        assert!(report.ok, "{:?}", report.errors);
    }
}
