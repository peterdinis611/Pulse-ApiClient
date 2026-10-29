//! Minimal JSON Schema checks (type / required / properties / items) — no extra deps.
//! Mirrors `python/pulse/schema.py` and `src/lib/json-schema.ts`.

use serde_json::Value;

pub fn validate_json(instance: &Value, schema: &Value, path: &str) -> Vec<String> {
    let mut errors = Vec::new();
    if let Some(expected) = schema.get("type") {
        if !matches_type(instance, expected) {
            errors.push(format!(
                "{path}: expected {}, got {}",
                type_label(expected),
                type_name(instance)
            ));
            return errors;
        }
    }

    if let Some(obj) = instance.as_object() {
        if let Some(required) = schema.get("required").and_then(|v| v.as_array()) {
            for key in required {
                let Some(name) = key.as_str() else { continue };
                if !obj.contains_key(name) {
                    errors.push(format!("{path}: missing required property '{name}'"));
                }
            }
        }
        let properties = schema
            .get("properties")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        for (key, child) in &properties {
            if let Some(value) = obj.get(key) {
                errors.extend(validate_json(value, child, &format!("{path}.{key}")));
            }
        }
        if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
            let extras: Vec<_> = obj
                .keys()
                .filter(|key| !properties.contains_key(key.as_str()))
                .cloned()
                .collect();
            if !extras.is_empty() {
                errors.push(format!(
                    "{path}: unexpected properties {}",
                    extras.join(", ")
                ));
            }
        }
    }

    if let Some(arr) = instance.as_array() {
        if let Some(items) = schema.get("items") {
            for (index, item) in arr.iter().enumerate() {
                errors.extend(validate_json(item, items, &format!("{path}[{index}]")));
            }
        }
        if let Some(min) = schema.get("minItems").and_then(|v| v.as_u64()) {
            if (arr.len() as u64) < min {
                errors.push(format!("{path}: expected at least {min} items"));
            }
        }
        if let Some(max) = schema.get("maxItems").and_then(|v| v.as_u64()) {
            if (arr.len() as u64) > max {
                errors.push(format!("{path}: expected at most {max} items"));
            }
        }
    }

    if schema.get("const").is_some() && schema.get("const") != Some(instance) {
        errors.push(format!(
            "{path}: expected {}",
            schema.get("const").unwrap()
        ));
    }
    if let Some(enumeration) = schema.get("enum").and_then(|v| v.as_array()) {
        if !enumeration.iter().any(|item| item == instance) {
            errors.push(format!("{path}: expected one of {enumeration:?}"));
        }
    }

    errors
}

fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(n) if n.is_i64() || n.is_u64() => "integer",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn type_label(expected: &Value) -> String {
    match expected {
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| item.as_str())
            .collect::<Vec<_>>()
            .join("|"),
        other => other.to_string(),
    }
}

fn matches_type(value: &Value, expected: &Value) -> bool {
    let names: Vec<&str> = match expected {
        Value::String(s) => vec![s.as_str()],
        Value::Array(items) => items.iter().filter_map(|item| item.as_str()).collect(),
        _ => return true,
    };
    let actual = type_name(value);
    names.iter().any(|name| {
        if *name == "number" {
            actual == "number" || actual == "integer"
        } else {
            *name == actual
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_required_and_type() {
        let schema = json!({
            "type": "object",
            "required": ["id"],
            "properties": { "id": { "type": "integer" } }
        });
        let ok = validate_json(&json!({"id": 1}), &schema, "$");
        assert!(ok.is_empty(), "{ok:?}");
        let bad = validate_json(&json!({"id": "x"}), &schema, "$");
        assert!(!bad.is_empty());
    }
}
