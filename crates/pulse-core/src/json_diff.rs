//! Tiny JSON / line diff for MCP/CLI (no extra deps).

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffRow {
    pub kind: &'static str,
    pub text: String,
}

/// Pretty-print JSON when possible; otherwise return the raw string.
pub fn pretty_json(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
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
        let b_missing_ahead = j < b.len() && (i >= a.len() || !a[i + 1..].contains(&b[j]));
        if b_missing_ahead {
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
    for (index, row) in rows.iter().enumerate() {
        if !show[index] {
            continue;
        }
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

/// Diff two JSON values (or raw strings) and return a text report.
pub fn compare(left: &Value, right: &Value) -> String {
    let left_text = pretty_json(left);
    let right_text = pretty_json(right);
    format_unified(&unified_lines(&left_text, &right_text), 2)
}

pub fn compare_raw(left: &str, right: &str) -> String {
    format_unified(&unified_lines(&pretty_any(left), &pretty_any(right)), 2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_added_and_removed_lines() {
        let rows = unified_lines("a\nb\n", "a\nc\n");
        assert!(rows.iter().any(|row| row.kind == "del" && row.text == "b"));
        assert!(rows.iter().any(|row| row.kind == "add" && row.text == "c"));
    }

    #[test]
    fn compare_json_objects() {
        let report = compare(&json!({"id": 1}), &json!({"id": 2}));
        assert!(report.contains("removed") || report.contains("-"));
        assert!(report.contains("1") && report.contains("2"));
    }
}
