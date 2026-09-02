use crate::types::EnvVariable;
use regex::Regex;
use std::sync::LazyLock;

static VARIABLE_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}").unwrap());

pub fn substitute_variables(input: &str, variables: &[EnvVariable]) -> String {
    if input.is_empty() || !input.contains("{{") {
        return input.to_string();
    }
    VARIABLE_PATTERN
        .replace_all(input, |caps: &regex::Captures| {
            let name = &caps[1];
            variables
                .iter()
                .find(|item| item.enabled && item.key.trim() == name)
                .map(|item| item.value.clone())
                .unwrap_or_else(|| caps[0].to_string())
        })
        .into_owned()
}

pub fn merge_variable_layers(layers: &[Vec<EnvVariable>]) -> Vec<EnvVariable> {
    let mut map = std::collections::BTreeMap::<String, EnvVariable>::new();
    for layer in layers {
        for variable in layer {
            if !variable.enabled || variable.key.trim().is_empty() {
                continue;
            }
            map.insert(variable.key.trim().to_string(), variable.clone());
        }
    }
    map.into_values().collect()
}

pub fn apply_mutations(variables: &mut Vec<EnvVariable>, mutations: &[(String, String)]) {
    for (key, value) in mutations {
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        if let Some(existing) = variables.iter_mut().find(|item| item.key.trim() == key) {
            existing.key = key.to_string();
            existing.value = value.clone();
            existing.enabled = true;
        } else {
            variables.push(EnvVariable {
                id: format!("var_{key}"),
                key: key.to_string(),
                value: value.clone(),
                enabled: true,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substitutes_enabled_variables() {
        let vars = vec![EnvVariable {
            id: "1".into(),
            key: "id".into(),
            value: "42".into(),
            enabled: true,
        }];
        assert_eq!(
            substitute_variables("https://api.test/{{id}}", &vars),
            "https://api.test/42"
        );
    }
}
