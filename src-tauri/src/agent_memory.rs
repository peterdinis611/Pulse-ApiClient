//! Desktop SQLite index for agent memory (mirrors workspace YAML + local facts).

use pulse_core::{
    delete_fact, get_fact, list_facts, upsert_fact, MemoryFact, MemoryScope, UpsertFactInput,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryFactDto {
    pub id: String,
    pub key: String,
    pub value: String,
    pub tags: Vec<String>,
    pub scope: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: String,
    pub note: Option<String>,
}

impl From<MemoryFact> for AgentMemoryFactDto {
    fn from(fact: MemoryFact) -> Self {
        Self {
            id: fact.id,
            key: fact.key,
            value: fact.value,
            tags: fact.tags,
            scope: fact.scope.as_str().into(),
            created_at: fact.created_at,
            updated_at: fact.updated_at,
            source: fact.source,
            note: fact.note,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryUpsertInput {
    pub workspace_root: String,
    pub key: String,
    pub value: String,
    pub scope: Option<String>,
    pub source: Option<String>,
    pub tags: Option<Vec<String>>,
    pub note: Option<String>,
}

pub fn migrate_agent_memory_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS agent_memory (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_root TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          scope TEXT NOT NULL,
          source TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(workspace_root, scope, key)
        );

        CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace_key
          ON agent_memory(workspace_root, key);
        CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace_updated
          ON agent_memory(workspace_root, updated_at DESC);
        ",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn fact_to_row(conn: &Connection, workspace_root: &str, fact: &MemoryFact) -> Result<(), String> {
    let tags = serde_json::to_string(&fact.tags).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT INTO agent_memory
          (id, workspace_root, key, value, tags, scope, source, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(workspace_root, scope, key) DO UPDATE SET
           id=excluded.id,
           value=excluded.value,
           tags=excluded.tags,
           source=excluded.source,
           note=excluded.note,
           updated_at=excluded.updated_at",
        params![
            fact.id,
            workspace_root,
            fact.key,
            fact.value,
            tags,
            fact.scope.as_str(),
            fact.source,
            fact.note,
            fact.created_at,
            fact.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reindex_workspace(conn: &Connection, workspace_root: &str) -> Result<usize, String> {
    // Keep local-scope rows; replace workspace-scope from YAML.
    conn.execute(
        "DELETE FROM agent_memory WHERE workspace_root = ?1 AND scope = 'workspace'",
        params![workspace_root],
    )
    .map_err(|e| e.to_string())?;

    let workspace_facts = list_facts(workspace_root, Some(MemoryScope::Workspace))?;
    for fact in &workspace_facts {
        fact_to_row(conn, workspace_root, fact)?;
    }

    // Mirror local YAML into SQLite (source of truth for CLI/local file).
    let local_facts = list_facts(workspace_root, Some(MemoryScope::Local))?;
    for fact in &local_facts {
        fact_to_row(conn, workspace_root, fact)?;
    }

    Ok(workspace_facts.len() + local_facts.len())
}

fn list_from_index(
    conn: &Connection,
    workspace_root: &str,
    query: Option<&str>,
) -> Result<Vec<AgentMemoryFactDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, key, value, tags, scope, source, note, created_at, updated_at
             FROM agent_memory
             WHERE workspace_root = ?1
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![workspace_root], |row| {
            let tags_raw: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
            Ok(AgentMemoryFactDto {
                id: row.get(0)?,
                key: row.get(1)?,
                value: row.get(2)?,
                tags,
                scope: row.get(4)?,
                source: row.get(5)?,
                note: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }

    if let Some(q) = query.map(str::trim).filter(|s| !s.is_empty()) {
        let needle = q.to_ascii_lowercase();
        out.retain(|fact| {
            fact.key.to_ascii_lowercase().contains(&needle)
                || fact.value.to_ascii_lowercase().contains(&needle)
                || fact
                    .note
                    .as_deref()
                    .map(|n| n.to_ascii_lowercase().contains(&needle))
                    .unwrap_or(false)
                || fact
                    .tags
                    .iter()
                    .any(|tag| tag.to_ascii_lowercase().contains(&needle))
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn agent_memory_reindex(
    db: State<'_, DbState>,
    workspace_root: String,
) -> Result<usize, String> {
    db.with_user_conn(|conn| reindex_workspace(conn, &workspace_root))
}

#[tauri::command]
pub fn agent_memory_list(
    db: State<'_, DbState>,
    workspace_root: String,
    query: Option<String>,
) -> Result<Vec<AgentMemoryFactDto>, String> {
    db.with_user_conn(|conn| {
        let mut facts = list_from_index(conn, &workspace_root, query.as_deref())?;
        if facts.is_empty() {
            let _ = reindex_workspace(conn, &workspace_root)?;
            facts = list_from_index(conn, &workspace_root, query.as_deref())?;
        }
        Ok(facts)
    })
}

#[tauri::command]
pub fn agent_memory_get(
    db: State<'_, DbState>,
    workspace_root: String,
    key: String,
) -> Result<Option<AgentMemoryFactDto>, String> {
    let indexed = db.with_user_conn(|conn| {
        conn.query_row(
            "SELECT id, key, value, tags, scope, source, note, created_at, updated_at
             FROM agent_memory
             WHERE workspace_root = ?1 AND key = ?2
             ORDER BY CASE scope WHEN 'local' THEN 0 ELSE 1 END
             LIMIT 1",
            params![workspace_root, key],
            |row| {
                let tags_raw: String = row.get(3)?;
                let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
                Ok(AgentMemoryFactDto {
                    id: row.get(0)?,
                    key: row.get(1)?,
                    value: row.get(2)?,
                    tags,
                    scope: row.get(4)?,
                    source: row.get(5)?,
                    note: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    })?;
    if indexed.is_some() {
        return Ok(indexed);
    }
    Ok(get_fact(&workspace_root, &key, None)?.map(AgentMemoryFactDto::from))
}

#[tauri::command]
pub fn agent_memory_upsert(
    db: State<'_, DbState>,
    input: AgentMemoryUpsertInput,
) -> Result<AgentMemoryFactDto, String> {
    let scope = MemoryScope::parse(input.scope.as_deref().unwrap_or("workspace"))
        .unwrap_or(MemoryScope::Workspace);
    let source = input.source.unwrap_or_else(|| "desktop".into());
    let fact = upsert_fact(
        &input.workspace_root,
        UpsertFactInput {
            key: &input.key,
            value: &input.value,
            scope,
            source: &source,
            tags: input.tags.unwrap_or_default(),
            note: input.note.as_deref(),
        },
    )?;
    db.with_user_conn(|conn| fact_to_row(conn, &input.workspace_root, &fact))?;
    Ok(AgentMemoryFactDto::from(fact))
}

#[tauri::command]
pub fn agent_memory_delete(
    db: State<'_, DbState>,
    workspace_root: String,
    key: String,
    scope: Option<String>,
) -> Result<bool, String> {
    let parsed_scope = scope.as_deref().and_then(MemoryScope::parse);
    let removed = delete_fact(&workspace_root, &key, parsed_scope)?;
    db.with_user_conn(|conn| {
        if let Some(scope) = parsed_scope {
            conn.execute(
                "DELETE FROM agent_memory WHERE workspace_root = ?1 AND key = ?2 AND scope = ?3",
                params![workspace_root, key, scope.as_str()],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "DELETE FROM agent_memory WHERE workspace_root = ?1 AND key = ?2",
                params![workspace_root, key],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })?;
    Ok(removed)
}

#[tauri::command]
pub fn agent_memory_clear_local(
    db: State<'_, DbState>,
    workspace_root: String,
) -> Result<usize, String> {
    let facts = list_facts(&workspace_root, Some(MemoryScope::Local))?;
    for fact in &facts {
        let _ = delete_fact(&workspace_root, &fact.key, Some(MemoryScope::Local))?;
    }
    db.with_user_conn(|conn| {
        conn.execute(
            "DELETE FROM agent_memory WHERE workspace_root = ?1 AND scope = 'local'",
            params![workspace_root],
        )
        .map_err(|e| e.to_string())
    })
}
