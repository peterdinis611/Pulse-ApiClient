use regex::Regex;
use std::sync::LazyLock;

use crate::types::EnvVariable;

static PATH_TOKEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r":([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\}").unwrap());

pub fn apply_path_params(url: &str, params: &[EnvVariable]) -> String {
    let values: std::collections::HashMap<String, String> = params
        .iter()
        .filter(|row| row.enabled && !row.key.trim().is_empty() && !row.value.is_empty())
        .map(|row| (row.key.trim().to_string(), row.value.clone()))
        .collect();

    let replace_path = |path: &str| {
        PATH_TOKEN
            .replace_all(path, |caps: &regex::Captures| {
                let name = caps.get(1).or_else(|| caps.get(2)).map(|m| m.as_str()).unwrap_or("");
                match values.get(name) {
                    Some(value) => value.replace(' ', "%20"),
                    None => caps[0].to_string(),
                }
            })
            .into_owned()
    };

    let (without_hash, hash) = url
        .split_once('#')
        .map(|(left, right)| (left.to_string(), format!("#{right}")))
        .unwrap_or_else(|| (url.to_string(), String::new()));
    let (base, query) = without_hash
        .split_once('?')
        .map(|(left, right)| (left.to_string(), format!("?{right}")))
        .unwrap_or_else(|| (without_hash, String::new()));

    if let Some(idx) = base.find("://") {
        let proto = &base[..idx + 3];
        let rest = &base[idx + 3..];
        if let Some(slash) = rest.find('/') {
            return format!(
                "{proto}{}{}{query}{hash}",
                &rest[..slash],
                replace_path(&rest[slash..])
            );
        }
        return format!("{base}{query}{hash}");
    }

    if let Some(slash) = base.find('/') {
        return format!("{}{}{query}{hash}", &base[..slash], replace_path(&base[slash..]));
    }
    format!("{}{query}{hash}", replace_path(&base))
}
