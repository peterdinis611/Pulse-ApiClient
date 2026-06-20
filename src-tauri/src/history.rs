use crate::search::{fuzzy_search_documents, SearchDocument, SearchMatch};
use crate::sql_safety::{
    clamp_limit, clamp_offset, filter_safe_ids, sanitize_fuzzy_query, validate_history_id,
    validate_http_method, MAX_BATCH_IDS,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const HISTORY_MAX_ENTRIES: usize = 5_000;
pub const HISTORY_SEARCH_CANDIDATE_LIMIT: usize = 5_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryResponsePayload {
    pub status: i64,
    pub elapsed_ms: i64,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntryPayload {
    pub id: String,
    pub sent_at: String,
    pub request: serde_json::Value,
    pub response: Option<HistoryResponsePayload>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub items: Vec<HistoryEntryPayload>,
    pub total: u64,
    pub has_more: bool,
}

fn request_label(request: &serde_json::Value) -> Result<(String, String, String), String> {
    let method = request
        .get("method")
        .and_then(|value| value.as_str())
        .unwrap_or("GET");
    let method = validate_http_method(method)?;

    let url = request
        .get("url")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if url.len() > 8_192 {
        return Err("Request URL is too long".to_string());
    }

    let name = request
        .get("name")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if name.len() > 512 {
        return Err("Request name is too long".to_string());
    }

    Ok((method, name, url))
}

fn validate_history_entry(entry: &HistoryEntryPayload) -> Result<(), String> {
    validate_history_id(&entry.id)?;
    if entry.sent_at.trim().is_empty() || entry.sent_at.len() > 64 {
        return Err("Invalid history timestamp".to_string());
    }
    request_label(&entry.request)?;
    Ok(())
}

fn row_to_entry(
    id: String,
    sent_at: String,
    request_json: String,
    status: Option<i64>,
    elapsed_ms: Option<i64>,
    size_bytes: Option<i64>,
) -> Result<HistoryEntryPayload, String> {
    let request: serde_json::Value =
        serde_json::from_str(&request_json).map_err(|error| error.to_string())?;
    let response = match (status, elapsed_ms, size_bytes) {
        (Some(status), Some(elapsed_ms), Some(size_bytes)) => Some(HistoryResponsePayload {
            status,
            elapsed_ms,
            size_bytes,
        }),
        _ => None,
    };

    Ok(HistoryEntryPayload {
        id,
        sent_at,
        request,
        response,
    })
}

fn fetch_history_entry_by_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<HistoryEntryPayload>, String> {
    validate_history_id(id)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, sent_at, request_json, status, elapsed_ms, size_bytes
             FROM request_history
             WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(params![id])
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        return Ok(Some(row_to_entry(
            row.get(0).map_err(|e| e.to_string())?,
            row.get(1).map_err(|e| e.to_string())?,
            row.get(2).map_err(|e| e.to_string())?,
            row.get(3).map_err(|e| e.to_string())?,
            row.get(4).map_err(|e| e.to_string())?,
            row.get(5).map_err(|e| e.to_string())?,
        )?));
    }

    Ok(None)
}

pub fn append_history_entry(conn: &Connection, entry: &HistoryEntryPayload) -> Result<(), String> {
    validate_history_entry(entry)?;

    let request_json =
        serde_json::to_string(&entry.request).map_err(|error| error.to_string())?;
    if request_json.len() > 1_048_576 {
        return Err("History request payload is too large".to_string());
    }

    let (method, name, url) = request_label(&entry.request)?;
    let status = entry.response.as_ref().map(|value| value.status);
    let elapsed_ms = entry.response.as_ref().map(|value| value.elapsed_ms);
    let size_bytes = entry.response.as_ref().map(|value| value.size_bytes);

    conn.execute(
        "INSERT INTO request_history (
            id, sent_at, method, name, url, request_json, status, elapsed_ms, size_bytes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            sent_at = excluded.sent_at,
            method = excluded.method,
            name = excluded.name,
            url = excluded.url,
            request_json = excluded.request_json,
            status = excluded.status,
            elapsed_ms = excluded.elapsed_ms,
            size_bytes = excluded.size_bytes",
        params![
            entry.id,
            entry.sent_at,
            method,
            name,
            url,
            request_json,
            status,
            elapsed_ms,
            size_bytes
        ],
    )
    .map_err(|e| e.to_string())?;

    trim_history(conn)?;
    Ok(())
}

pub fn import_history_entries(
    conn: &Connection,
    entries: &[HistoryEntryPayload],
) -> Result<u64, String> {
    if entries.len() > HISTORY_MAX_ENTRIES {
        return Err(format!(
            "Cannot import more than {HISTORY_MAX_ENTRIES} history entries at once"
        ));
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut imported = 0u64;

    for entry in entries {
        append_history_entry(&tx, entry)?;
        imported += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(imported)
}

pub fn list_history_page(
    conn: &Connection,
    limit: u32,
    offset: u32,
) -> Result<HistoryPage, String> {
    let limit = clamp_limit(limit, 1, 200) as i64;
    let offset = clamp_offset(offset);
    let total: u64 = conn
        .query_row("SELECT COUNT(*) FROM request_history", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, sent_at, request_json, status, elapsed_ms, size_bytes
             FROM request_history
             ORDER BY sent_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit, offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        let (id, sent_at, request_json, status, elapsed_ms, size_bytes) =
            row.map_err(|e| e.to_string())?;
        items.push(row_to_entry(
            id,
            sent_at,
            request_json,
            status,
            elapsed_ms,
            size_bytes,
        )?);
    }

    let has_more = (offset + limit) < total as i64;
    Ok(HistoryPage {
        items,
        total,
        has_more,
    })
}

pub fn history_count(conn: &Connection) -> Result<u64, String> {
    conn.query_row("SELECT COUNT(*) FROM request_history", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

pub fn clear_history(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM request_history", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn history_search_documents(conn: &Connection, limit: usize) -> Result<Vec<SearchDocument>, String> {
    let limit = limit.min(HISTORY_SEARCH_CANDIDATE_LIMIT) as i64;
    let mut stmt = conn
        .prepare(
            "SELECT id, method, name, url, status, elapsed_ms
             FROM request_history
             ORDER BY sent_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut documents = Vec::new();
    for row in rows {
        let (id, method, name, url, status, elapsed_ms) = row.map_err(|e| e.to_string())?;
        let title = if name.trim().is_empty() {
            url.clone()
        } else {
            name
        };
        let meta = match (status, elapsed_ms) {
            (Some(status), Some(elapsed_ms)) => format!("{status} {elapsed_ms}ms"),
            _ => "Not sent".to_string(),
        };
        documents.push(SearchDocument {
            id,
            title,
            subtitle: url,
            method,
            meta,
            keywords: status.map(|value| value.to_string()).unwrap_or_default(),
        });
    }

    Ok(documents)
}

pub fn search_history(
    conn: &Connection,
    query: &str,
    limit: u32,
) -> Result<Vec<HistoryEntryPayload>, String> {
    let query = sanitize_fuzzy_query(query)?;
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let limit = clamp_limit(limit, 1, MAX_BATCH_IDS as u32) as usize;
    let documents = history_search_documents(conn, HISTORY_SEARCH_CANDIDATE_LIMIT)?;
    let matches: Vec<SearchMatch> = fuzzy_search_documents(&query, &documents, Some(limit));
    if matches.is_empty() {
        return Ok(Vec::new());
    }

    let safe_ids: Vec<String> = filter_safe_ids(matches.iter().map(|item| item.id.as_str()));
    let mut items = Vec::with_capacity(safe_ids.len());

    for id in safe_ids {
        if let Some(entry) = fetch_history_entry_by_id(conn, &id)? {
            items.push(entry);
        }
    }

    let order: std::collections::HashMap<String, usize> = matches
        .iter()
        .enumerate()
        .map(|(index, item)| (item.id.clone(), index))
        .collect();
    items.sort_by_key(|entry| order.get(&entry.id).copied().unwrap_or(usize::MAX));

    Ok(items)
}

fn trim_history(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM request_history", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let max = HISTORY_MAX_ENTRIES as i64;
    if count <= max {
        return Ok(());
    }

    let excess = count - max;
    conn.execute(
        "DELETE FROM request_history
         WHERE id IN (
           SELECT id FROM request_history ORDER BY sent_at ASC LIMIT ?1
         )",
        params![excess],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
#[path = "__tests__/history_tests.rs"]
mod tests;
