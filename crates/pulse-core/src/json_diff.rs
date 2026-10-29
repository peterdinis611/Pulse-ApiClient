//! JSON / line diff for MCP/CLI (no extra deps).
//! Line-oriented unified diff + structural JSON path report.

use serde_json::{json, Map, Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffRow {
    pub kind: &'static str,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PathChange {
    pub path: String,
    pub kind: &'static str,
    pub left: Option<Value>,
    pub right: Option<Value>,
}

/// Pretty-print JSON when possible; otherwise return the raw string.
pub fn pretty_json(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

/// Pretty-print with recursively sorted object keys (stable diffs).
pub fn pretty_json_sorted(value: &Value) -> String {
    pretty_json(&sort_value(value))
}

pub fn pretty_any(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
            return pretty_json(&value);
        }
    }
    raw.to_string()
}

pub fn pretty_any_sorted(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
            return pretty_json_sorted(&value);
        }
    }
    raw.to_string()
}

fn sort_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().cloned().collect();
            keys.sort();
            let mut out = Map::new();
            for key in keys {
                if let Some(child) = map.get(&key) {
                    out.insert(key, sort_value(child));
                }
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(sort_value).collect()),
        other => other.clone(),
    }
}

/// Greedy line-oriented unified diff rows (`same` / `add` / `del`).
pub fn unified_lines(left: &str, right: &str) -> Vec<DiffRow> {
    let left_norm = left.replace("\r\n", "\n");
    let right_norm = right.replace("\r\n", "\n");
    let a: Vec<&str> = left_norm.split('\n').collect();
    let b: Vec<&str> = right_norm.split('\n').collect();
    let mut rows = Vec::new();
    let mut i = 0usize;
    let mut j = 0usize;
    while i < a.len() || j < b.len() {
        if i < a.len() && j < b.len() && a[i] == b[j] {
            rows.push(DiffRow {
                kind: "same",
                text: a[i].to_string(),
            });
            i += 1;
            j += 1;
            continue;
        }
        // Prefer pairing identical lines when both sides diverge (simple look-ahead).
        if i < a.len() && j < b.len() {
            let a_in_b = b[j + 1..].iter().position(|line| *line == a[i]);
            let b_in_a = a[i + 1..].iter().position(|line| *line == b[j]);
            match (a_in_b, b_in_a) {
                (Some(bi), Some(ai)) if bi <= ai => {
                    rows.push(DiffRow {
                        kind: "add",
                        text: b[j].to_string(),
                    });
                    j += 1;
                    continue;
                }
                (Some(_), None) => {
                    rows.push(DiffRow {
                        kind: "add",
                        text: b[j].to_string(),
                    });
                    j += 1;
                    continue;
                }
                (None, Some(_)) | (Some(_), Some(_)) => {
                    rows.push(DiffRow {
                        kind: "del",
                        text: a[i].to_string(),
                    });
                    i += 1;
                    continue;
                }
                (None, None) => {
                    rows.push(DiffRow {
                        kind: "del",
                        text: a[i].to_string(),
                    });
                    rows.push(DiffRow {
                        kind: "add",
                        text: b[j].to_string(),
                    });
                    i += 1;
                    j += 1;
                    continue;
                }
            }
        }
        if j < b.len() {
            rows.push(DiffRow {
                kind: "add",
                text: b[j].to_string(),
            });
            j += 1;
            continue;
        }
        if i < a.len() {
            rows.push(DiffRow {
                kind: "del",
                text: a[i].to_string(),
            });
            i += 1;
        }
    }
    rows
}

pub fn format_unified(rows: &[DiffRow], context: usize) -> String {
    let mut show = vec![false; rows.len()];
    for (index, row) in rows.iter().enumerate() {
        if row.kind != "same" {
            let start = index.saturating_sub(context);
            let end = (index + context + 1).min(rows.len());
            for slot in show.iter_mut().take(end).skip(start) {
                *slot = true;
            }
        }
    }
    let mut lines = Vec::new();
    let mut gap = false;
    for (index, row) in rows.iter().enumerate() {
        if !show[index] {
            gap = true;
            continue;
        }
        if gap && !lines.is_empty() {
            lines.push("@@".into());
        }
        gap = false;
        let prefix = match row.kind {
            "add" => "+",
            "del" => "-",
            _ => " ",
        };
        lines.push(format!("{prefix}{}", row.text));
    }
    let added = rows.iter().filter(|row| row.kind == "add").count();
    let removed = rows.iter().filter(|row| row.kind == "del").count();
    let header = format!("{removed} removed, {added} added");
    if lines.is_empty() {
        header
    } else {
        format!("{header}\n{}", lines.join("\n"))
    }
}

/// Structural walk: emit changed JSON paths (`add` / `del` / `change`).
pub fn path_changes(left: &Value, right: &Value) -> Vec<PathChange> {
    let mut out = Vec::new();
    walk_paths("$", left, right, &mut out);
    out
}

fn walk_paths(path: &str, left: &Value, right: &Value, out: &mut Vec<PathChange>) {
    if left == right {
        return;
    }
    match (left, right) {
        (Value::Object(a), Value::Object(b)) => {
            let mut keys: Vec<_> = a.keys().chain(b.keys()).cloned().collect();
            keys.sort();
            keys.dedup();
            for key in keys {
                let child = if path == "$" {
                    format!("$.{key}")
                } else {
                    format!("{path}.{key}")
                };
                match (a.get(&key), b.get(&key)) {
                    (Some(lv), Some(rv)) => walk_paths(&child, lv, rv, out),
                    (Some(lv), None) => out.push(PathChange {
                        path: child,
                        kind: "del",
                        left: Some(lv.clone()),
                        right: None,
                    }),
                    (None, Some(rv)) => out.push(PathChange {
                        path: child,
                        kind: "add",
                        left: None,
                        right: Some(rv.clone()),
                    }),
                    (None, None) => {}
                }
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            let len = a.len().max(b.len());
            for index in 0..len {
                let child = format!("{path}[{index}]");
                match (a.get(index), b.get(index)) {
                    (Some(lv), Some(rv)) => walk_paths(&child, lv, rv, out),
                    (Some(lv), None) => out.push(PathChange {
                        path: child,
                        kind: "del",
                        left: Some(lv.clone()),
                        right: None,
                    }),
                    (None, Some(rv)) => out.push(PathChange {
                        path: child,
                        kind: "add",
                        left: None,
                        right: Some(rv.clone()),
                    }),
                    (None, None) => {}
                }
            }
        }
        _ => out.push(PathChange {
            path: path.to_string(),
            kind: "change",
            left: Some(left.clone()),
            right: Some(right.clone()),
        }),
    }
}

fn path_changes_json(changes: &[PathChange], limit: usize) -> Value {
    Value::Array(
        changes
            .iter()
            .take(limit)
            .map(|item| {
                json!({
                    "path": item.path,
                    "kind": item.kind,
                    "left": item.left,
                    "right": item.right,
                })
            })
            .collect(),
    )
}

/// Full structured report (Python/`pulse diff` compatible).
pub fn compare_report(left: &Value, right: &Value) -> Value {
    let left_sorted = sort_value(left);
    let right_sorted = sort_value(right);
    let left_text = pretty_json(&left_sorted);
    let right_text = pretty_json(&right_sorted);
    let rows = unified_lines(&left_text, &right_text);
    let added = rows.iter().filter(|row| row.kind == "add").count();
    let removed = rows.iter().filter(|row| row.kind == "del").count();
    let paths = path_changes(&left_sorted, &right_sorted);
    let changed_lines: Vec<Value> = rows
        .iter()
        .filter(|row| row.kind != "same")
        .take(80)
        .map(|row| json!({ "kind": row.kind, "text": row.text }))
        .collect();
    json!({
        "equal": left_sorted == right_sorted,
        "removed": removed,
        "added": added,
        "pathsChanged": paths.len(),
        "diff": format_unified(&rows, 2),
        "changedLines": changed_lines,
        "paths": path_changes_json(&paths, 80),
    })
}

/// Diff two JSON values and return the unified text report.
pub fn compare(left: &Value, right: &Value) -> String {
    compare_report(left, right)
        .get("diff")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

pub fn compare_raw(left: &str, right: &str) -> String {
    let left_text = pretty_any_sorted(left);
    let right_text = pretty_any_sorted(right);
    format_unified(&unified_lines(&left_text, &right_text), 2)
}

pub fn compare_raw_report(left: &str, right: &str) -> Value {
    let left_value = serde_json::from_str::<Value>(left.trim())
        .unwrap_or_else(|_| Value::String(left.to_string()));
    let right_value = serde_json::from_str::<Value>(right.trim())
        .unwrap_or_else(|_| Value::String(right.to_string()));
    if left_value.is_object() || left_value.is_array() || right_value.is_object() || right_value.is_array()
    {
        return compare_report(&left_value, &right_value);
    }
    let left_text = pretty_any_sorted(left);
    let right_text = pretty_any_sorted(right);
    let rows = unified_lines(&left_text, &right_text);
    let added = rows.iter().filter(|row| row.kind == "add").count();
    let removed = rows.iter().filter(|row| row.kind == "del").count();
    json!({
        "equal": left_text == right_text,
        "removed": removed,
        "added": added,
        "pathsChanged": 0,
        "diff": format_unified(&rows, 2),
        "changedLines": rows.iter().filter(|row| row.kind != "same").take(80).map(|row| json!({ "kind": row.kind, "text": row.text })).collect::<Vec<_>>(),
        "paths": [],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_added_and_removed_lines() {
        let rows = unified_lines("a\nb\nc\n", "a\nx\nc\n");
        assert!(rows.iter().any(|row| row.kind == "del" && row.text == "b"));
        assert!(rows.iter().any(|row| row.kind == "add" && row.text == "x"));
        assert!(rows.iter().any(|row| row.kind == "same" && row.text == "c"));
    }

    #[test]
    fn compare_json_objects() {
        let report = compare_report(&json!({"id": 1, "name": "a"}), &json!({"id": 2, "name": "a"}));
        assert_eq!(report["equal"], false);
        assert!(report["pathsChanged"].as_u64().unwrap_or(0) >= 1);
        let paths = report["paths"].as_array().unwrap();
        assert!(paths.iter().any(|item| item["path"] == "$.id"));
    }

    #[test]
    fn sorted_keys_ignore_key_order() {
        let report = compare_report(&json!({"b": 1, "a": 2}), &json!({"a": 2, "b": 1}));
        assert_eq!(report["equal"], true);
    }
}
