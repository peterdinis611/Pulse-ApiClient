//! Desktop RAG: rebuild/upsert index including SQLite request_history rows.

use pulse_core::{
    doc_from_request_history, format_rag_hits_markdown, prune_rag_index, rag_index_path,
    rebuild_rag_index, search_rag, upsert_rag_docs, RagDocument, RagHit,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::db::DbState;
use crate::git_workspace::{self, GitWatchState};
use crate::history::HistoryEntryPayload;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagHitDto {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub score: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_id: Option<String>,
}

impl From<RagHit> for RagHitDto {
    fn from(hit: RagHit) -> Self {
        let method = hit
            .meta
            .as_ref()
            .and_then(|m| {
                m.get("method")
                    .or_else(|| m.pointer("/request/method"))
                    .and_then(|v| v.as_str())
            })
            .map(str::to_string);
        let url = hit
            .meta
            .as_ref()
            .and_then(|m| {
                m.get("url")
                    .or_else(|| m.pointer("/request/url"))
                    .and_then(|v| v.as_str())
            })
            .map(str::to_string);
        let name = hit
            .meta
            .as_ref()
            .and_then(|m| {
                m.get("name")
                    .or_else(|| m.pointer("/request/name"))
                    .and_then(|v| v.as_str())
            })
            .map(str::to_string);
        let status = hit.meta.as_ref().and_then(|m| {
            m.get("status")
                .or_else(|| m.pointer("/response/status"))
                .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|n| n as i64)))
        });
        let history_id = hit.id.strip_prefix("req:").or_else(|| hit.id.strip_prefix("hist:")).map(str::to_string)
            .or_else(|| {
                hit.meta
                    .as_ref()
                    .and_then(|m| m.get("id").and_then(|v| v.as_str()))
                    .map(str::to_string)
            });
        Self {
            id: hit.id,
            kind: hit.kind,
            text: hit.text,
            score: hit.score,
            method,
            url,
            name,
            status,
            history_id,
        }
    }
}

fn request_history_docs(conn: &rusqlite::Connection) -> Result<Vec<RagDocument>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, sent_at, method, name, url, status, request_json
             FROM request_history
             ORDER BY sent_at DESC
             LIMIT 2000",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (id, sent_at, method, name, url, status, request_json) = row.map_err(|e| e.to_string())?;
        out.push(doc_from_request_history(
            &id,
            &sent_at,
            &method,
            &name,
            &url,
            status,
            &request_json,
        ));
    }
    Ok(out)
}

pub fn rebuild_with_request_history(
    conn: &rusqlite::Connection,
    workspace_root: &str,
) -> Result<usize, String> {
    let extra = request_history_docs(conn).unwrap_or_default();
    let count = rebuild_rag_index(workspace_root, &extra)?;
    prune_rag_index(workspace_root, Some(30), Some(5_000)).unwrap_or(count);
    Ok(count)
}

pub fn upsert_history_entry(workspace_root: &str, entry: &HistoryEntryPayload) -> Result<(), String> {
    let request_json = serde_json::to_string(&entry.request).unwrap_or_else(|_| "{}".into());
    let method = entry
        .request
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET");
    let name = entry
        .request
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let url = entry
        .request
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let status = entry.response.as_ref().map(|r| r.status);
    let doc = doc_from_request_history(
        &entry.id,
        &entry.sent_at,
        method,
        name,
        url,
        status,
        &request_json,
    );
    upsert_rag_docs(workspace_root, &[doc])?;
    Ok(())
}

#[tauri::command]
pub fn agent_rag_reindex(
    db: State<'_, DbState>,
    workspace_root: String,
) -> Result<usize, String> {
    db.with_user_conn(|conn| rebuild_with_request_history(conn, &workspace_root))
}

#[tauri::command]
pub fn agent_rag_search(
    db: State<'_, DbState>,
    workspace_root: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<RagHitDto>, String> {
    db.with_user_conn(|conn| {
        let path = rag_index_path(&workspace_root);
        if !path.is_file() {
            rebuild_with_request_history(conn, &workspace_root)?;
        }
        Ok(())
    })?;
    let hits = search_rag(&workspace_root, &query, limit.unwrap_or(8) as usize)?;
    Ok(hits.into_iter().map(RagHitDto::from).collect())
}

#[tauri::command]
pub fn agent_rag_search_markdown(
    db: State<'_, DbState>,
    workspace_root: String,
    query: String,
    limit: Option<u32>,
) -> Result<String, String> {
    let hits = agent_rag_search(db, workspace_root, query.clone(), limit)?;
    let rag_hits: Vec<RagHit> = hits
        .into_iter()
        .map(|h| RagHit {
            id: h.id,
            kind: h.kind,
            text: h.text,
            score: h.score,
            meta: None,
        })
        .collect();
    Ok(format_rag_hits_markdown(&rag_hits, &query))
}

#[tauri::command]
pub fn agent_rag_prune(
    workspace_root: String,
    older_than_days: Option<u64>,
    max_docs: Option<u32>,
) -> Result<usize, String> {
    prune_rag_index(
        &workspace_root,
        older_than_days,
        max_docs.map(|n| n as usize),
    )
}

/// Best-effort incremental RAG upsert after desktop history append.
/// Runs off the IPC thread and coalesces bursts so rapid sends do not block UI.
pub fn on_history_appended(app: &AppHandle, entry: &HistoryEntryPayload) {
    let Some(watch) = app.try_state::<GitWatchState>() else {
        return;
    };
    let Some(root) = git_workspace::current_root(&watch) else {
        return;
    };
    let root = root.to_string();
    let entry = entry.clone();
    std::thread::spawn(move || {
        // Small settle delay coalesces back-to-back history writes from collection runs.
        std::thread::sleep(std::time::Duration::from_millis(80));
        let _ = upsert_history_entry(&root, &entry);
    });
}
