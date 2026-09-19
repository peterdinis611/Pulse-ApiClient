//! Secret namespace helpers: dotenv parse, JSON redaction, YAML stripping.

use crate::types::EnvVariable;
use serde_json::Value;

pub fn parse_dotenv(text: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        let mut value = value.trim().to_string();
        if (value.starts_with('"') && value.ends_with('"')) || (value.starts_with('\'') && value.ends_with('\''))
        {
            value = value[1..value.len() - 1].to_string();
        }
        pairs.push((key.to_string(), value));
    }
    pairs
}

pub fn dotenv_to_variables(pairs: &[(String, String)]) -> Vec<EnvVariable> {
    pairs
        .iter()
        .map(|(key, value)| {
            let namespaced = if key.starts_with("secret.") {
                key.clone()
            } else {
                format!("secret.{key}")
            };
            EnvVariable {
                id: format!("secret_{key}"),
                key: namespaced,
                value: value.clone(),
                enabled: true,
                secret: true,
            }
        })
        .collect()
}

pub fn secret_keys(variables: &[EnvVariable]) -> Vec<String> {
    let mut keys: Vec<String> = variables
        .iter()
        .filter(|item| item.secret || item.key.starts_with("secret."))
        .flat_map(|item| {
            let key = item.key.trim();
            let short = key.strip_prefix("secret.").unwrap_or(key);
            [key.to_string(), short.to_string(), format!("secret.{short}")]
        })
        .collect();
    keys.sort();
    keys.dedup();
    keys
}

pub fn is_secret_placeholder(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.is_empty() || (trimmed.starts_with("{{secret.") && trimmed.ends_with("}}"))
}

/// Replace resolved secret values in a JSON tree with `{{secret.*}}` placeholders.
pub fn redact_json(value: &mut Value, secrets: &[EnvVariable]) {
    let replacements: Vec<(String, String)> = secrets
        .iter()
        .filter(|item| item.secret || item.key.starts_with("secret."))
        .filter(|item| !item.value.is_empty())
        .map(|item| {
            let short = item
                .key
                .trim()
                .strip_prefix("secret.")
                .unwrap_or(item.key.trim());
            (item.value.clone(), format!("{{{{secret.{short}}}}}"))
        })
        .collect();
    redact_value(value, &replacements);
}

fn redact_value(value: &mut Value, replacements: &[(String, String)]) {
    match value {
        Value::String(text) => {
            let mut next = text.clone();
            for (secret, placeholder) in replacements {
                if !secret.is_empty() && next.contains(secret.as_str()) {
                    next = next.replace(secret, placeholder);
                }
            }
            *text = next;
        }
        Value::Array(items) => {
            for item in items {
                redact_value(item, replacements);
            }
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                redact_value(item, replacements);
            }
        }
        _ => {}
    }
}

pub fn strip_secret_values_from_vars(variables: &mut [EnvVariable]) {
    for item in variables {
        if item.secret || item.key.starts_with("secret.") {
            let short = item
                .key
                .trim()
                .strip_prefix("secret.")
                .unwrap_or(item.key.trim());
            item.value = format!("{{{{secret.{short}}}}}");
            item.secret = true;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_dotenv_and_redacts() {
        let pairs = parse_dotenv("API_TOKEN=shh\n# skip\nexport OTHER='x'\n");
        assert_eq!(pairs, vec![("API_TOKEN".into(), "shh".into()), ("OTHER".into(), "x".into())]);
        let vars = dotenv_to_variables(&pairs);
        let mut payload = json!({"auth": {"bearerToken": "shh"}});
        redact_json(&mut payload, &vars);
        assert_eq!(payload["auth"]["bearerToken"], "{{secret.API_TOKEN}}");
    }
}
