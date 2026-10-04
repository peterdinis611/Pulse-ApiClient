//! Structured agent memory: workspace-syncable facts + gitignored local facts.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryScope {
    Workspace,
    Local,
}

impl MemoryScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Workspace => "workspace",
            Self::Local => "local",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "workspace" | "ws" | "shared" => Some(Self::Workspace),
            "local" | "device" | "private" => Some(Self::Local),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFact {
    pub id: String,
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub scope: MemoryScope,
    pub created_at: String,
    pub updated_at: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MemoryFile {
    version: u32,
    #[serde(default)]
    facts: Vec<MemoryFact>,
}

impl Default for MemoryFile {
    fn default() -> Self {
        Self {
            version: 1,
            facts: Vec::new(),
        }
    }
}

fn now_iso() -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let secs = millis / 1000;
    let ms = millis % 1000;
    format!("{secs}.{ms:03}Z")
}

fn new_id() -> String {
    format!("fact_{}", now_iso().replace('.', ""))
}

pub fn memory_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join("memory")
}

pub fn workspace_facts_path(root: &str) -> PathBuf {
    memory_dir(root).join("facts.yaml")
}

pub fn local_facts_path(root: &str) -> PathBuf {
    PathBuf::from(root).join(".pulse").join("memory-local.yaml")
}

fn path_for_scope(root: &str, scope: MemoryScope) -> PathBuf {
    match scope {
        MemoryScope::Workspace => workspace_facts_path(root),
        MemoryScope::Local => local_facts_path(root),
    }
}

fn load_file(path: &Path) -> Result<MemoryFile, String> {
    if !path.is_file() {
        return Ok(MemoryFile::default());
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(MemoryFile::default());
    }
    serde_yaml::from_str(&text).map_err(|e| format!("Invalid memory file {}: {e}", path.display()))
}

fn save_file(path: &Path, file: &MemoryFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_yaml::to_string(file).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

pub fn load_facts_for_scope(root: &str, scope: MemoryScope) -> Result<Vec<MemoryFact>, String> {
    let mut file = load_file(&path_for_scope(root, scope))?;
    for fact in &mut file.facts {
        fact.scope = scope;
    }
    Ok(file.facts)
}

pub fn list_facts(root: &str, scope: Option<MemoryScope>) -> Result<Vec<MemoryFact>, String> {
    match scope {
        Some(scope) => load_facts_for_scope(root, scope),
        None => {
            let mut out = load_facts_for_scope(root, MemoryScope::Workspace)?;
            out.extend(load_facts_for_scope(root, MemoryScope::Local)?);
            out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            Ok(out)
        }
    }
}

pub fn get_fact(root: &str, key: &str, scope: Option<MemoryScope>) -> Result<Option<MemoryFact>, String> {
    let key = normalize_key(key);
    let facts = list_facts(root, scope)?;
    Ok(facts.into_iter().find(|item| item.key == key))
}

pub fn search_facts(root: &str, query: &str) -> Result<Vec<MemoryFact>, String> {
    let q = query.trim().to_ascii_lowercase();
    if q.is_empty() {
        return list_facts(root, None);
    }
    let facts = list_facts(root, None)?;
    Ok(facts
        .into_iter()
        .filter(|fact| {
            fact.key.to_ascii_lowercase().contains(&q)
                || fact.value.to_ascii_lowercase().contains(&q)
                || fact
                    .note
                    .as_deref()
                    .map(|n| n.to_ascii_lowercase().contains(&q))
                    .unwrap_or(false)
                || fact
                    .tags
                    .iter()
                    .any(|tag| tag.to_ascii_lowercase().contains(&q))
        })
        .collect())
}

pub fn normalize_key(raw: &str) -> String {
    raw.trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' {
                ch
            } else if ch.is_whitespace() {
                '_'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_ascii_lowercase()
}

pub struct UpsertFactInput<'a> {
    pub key: &'a str,
    pub value: &'a str,
    pub scope: MemoryScope,
    pub source: &'a str,
    pub tags: Vec<String>,
    pub note: Option<&'a str>,
}

pub fn upsert_fact(root: &str, input: UpsertFactInput<'_>) -> Result<MemoryFact, String> {
    let key = normalize_key(input.key);
    if key.is_empty() {
        return Err("Memory key is empty".into());
    }
    let value = input.value.trim();
    if value.is_empty() {
        return Err("Memory value is empty".into());
    }

    let path = path_for_scope(root, input.scope);
    let mut file = load_file(&path)?;
    let now = now_iso();
    let tags: Vec<String> = input
        .tags
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();

    if let Some(existing) = file.facts.iter_mut().find(|item| item.key == key) {
        existing.value = value.to_string();
        existing.tags = tags;
        existing.updated_at = now.clone();
        existing.source = input.source.to_string();
        existing.note = input.note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        existing.scope = input.scope;
        let out = existing.clone();
        save_file(&path, &file)?;
        return Ok(out);
    }

    let fact = MemoryFact {
        id: new_id(),
        key,
        value: value.to_string(),
        tags,
        scope: input.scope,
        created_at: now.clone(),
        updated_at: now,
        source: input.source.to_string(),
        note: input.note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()),
    };
    file.facts.push(fact.clone());
    save_file(&path, &file)?;
    Ok(fact)
}

pub fn delete_fact(root: &str, key: &str, scope: Option<MemoryScope>) -> Result<bool, String> {
    let key = normalize_key(key);
    if key.is_empty() {
        return Err("Memory key is empty".into());
    }

    let scopes: Vec<MemoryScope> = match scope {
        Some(s) => vec![s],
        None => vec![MemoryScope::Workspace, MemoryScope::Local],
    };

    let mut removed = false;
    for scope in scopes {
        let path = path_for_scope(root, scope);
        let mut file = load_file(&path)?;
        let before = file.facts.len();
        file.facts.retain(|item| item.key != key);
        if file.facts.len() != before {
            removed = true;
            save_file(&path, &file)?;
        }
    }
    Ok(removed)
}

pub fn format_facts_markdown(facts: &[MemoryFact], title: &str) -> String {
    if facts.is_empty() {
        return format!("**{title}**\n\n_(empty)_");
    }
    let mut lines = vec![format!("**{title}** ({})", facts.len()), String::new()];
    for fact in facts.iter().take(40) {
        let tags = if fact.tags.is_empty() {
            String::new()
        } else {
            format!(" · {}", fact.tags.join(", "))
        };
        let note = fact
            .note
            .as_deref()
            .map(|n| format!(" — _{n}_"))
            .unwrap_or_default();
        lines.push(format!(
            "- `{}` = {} `[{}]`{tags}{note}",
            fact.key,
            fact.value,
            fact.scope.as_str()
        ));
    }
    if facts.len() > 40 {
        lines.push(format!("…+{} more", facts.len() - 40));
    }
    lines.join("\n")
}

/// Parse `key=value`, `key: value`, or `key is value`.
pub fn parse_remember_pair(raw: &str) -> Option<(String, String)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some((key, value)) = trimmed.split_once('=') {
        let key = key.trim();
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if !key.is_empty() && !value.is_empty() {
            return Some((key.to_string(), value.to_string()));
        }
    }
    if let Some((key, value)) = trimmed.split_once(':') {
        let key = key.trim();
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if !key.is_empty() && !value.is_empty() && !key.contains(' ') {
            return Some((key.to_string(), value.to_string()));
        }
    }
    let lower = trimmed.to_ascii_lowercase();
    if let Some(idx) = lower.find(" is ") {
        let key = trimmed[..idx].trim();
        let value = trimmed[idx + 4..].trim().trim_matches('"').trim_matches('\'');
        if !key.is_empty() && !value.is_empty() {
            return Some((key.to_string(), value.to_string()));
        }
    }
    None
}

#[cfg(test)]
#[path = "__tests__/agent_memory_tests.rs"]
mod tests;
