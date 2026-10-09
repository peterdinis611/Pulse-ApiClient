//! Desktop RAG: rebuild index including SQLite request_history rows.

use pulse_core::{
    docs_from_request_rows, format_rag_hits_markdown, rag_index_path, rebuild_rag_index, search_rag,
    RagHit,
};
use serde::Serialize;
use tauri::State;

use crate::db::DbState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagHitDto {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub score: f32,
}

impl From<RagHit> for RagHitDto {
    fn from(hit: RagHit) -> Self {
        Self {
            id: hit.id,
            kind: hit.kind,
            text: hit.text,
            score: hit.score,
        }
    }
}

fn request_history_docs(conn: &rusqlite::Connection) -> Result<Vec<pulse_core::RagDocument>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, sent_at, method, name, url, status
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
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(docs_from_request_rows(&out))
}

pub fn rebuild_with_request_history(
    conn: &rusqlite::Connection,
    workspace_root: &str,
) -> Result<usize, String> {
    let extra = request_history_docs(conn).unwrap_or_default();
    rebuild_rag_index(workspace_root, &extra)
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
