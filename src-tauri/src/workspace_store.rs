use rusqlite::{params, Connection};
use serde_json::{json, Value};

fn table_count(conn: &Connection, table: &str) -> Result<i64, String> {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

pub fn migrate_workspace_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workspace_collections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          json TEXT NOT NULL,
          sort_index INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspace_requests (
          id TEXT PRIMARY KEY NOT NULL,
          collection_id TEXT NOT NULL,
          name TEXT NOT NULL,
          folder TEXT,
          json TEXT NOT NULL,
          sort_index INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspace_environments (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          json TEXT NOT NULL,
          sort_index INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspace_meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_normalized_workspace(conn: &Connection, payload: &str, updated_at: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO workspace (id, payload, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
        params![payload, updated_at],
    )
    .map_err(|e| e.to_string())?;
    split_workspace(conn, payload, updated_at)
}

pub fn load_normalized_workspace(conn: &Connection) -> Result<Option<String>, String> {
    let collections = table_count(conn, "workspace_collections")?;
    let requests = table_count(conn, "workspace_requests")?;
    if collections > 0 || requests > 0 {
        return Ok(Some(assemble_workspace(conn)?));
    }
    let mut stmt = conn
        .prepare("SELECT payload FROM workspace WHERE id = 1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let payload: String = row.get(0).map_err(|e| e.to_string())?;
        let updated_at = conn
            .query_row(
                "SELECT updated_at FROM workspace WHERE id = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into());
        let _ = split_workspace(conn, &payload, &updated_at);
        return Ok(Some(payload));
    }
    Ok(None)
}

fn split_workspace(conn: &Connection, payload: &str, updated_at: &str) -> Result<(), String> {
    let value: Value = serde_json::from_str(payload).unwrap_or_else(|_| json!({}));
    conn.execute("DELETE FROM workspace_collections", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM workspace_requests", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM workspace_environments", []).map_err(|e| e.to_string())?;

    if let Some(groups) = value.get("collectionGroups").and_then(Value::as_array) {
        for (index, group) in groups.iter().enumerate() {
            let id = group.get("id").and_then(Value::as_str).unwrap_or("");
            let name = group.get("name").and_then(Value::as_str).unwrap_or("");
            conn.execute(
                "INSERT INTO workspace_collections (id, name, json, sort_index) VALUES (?1, ?2, ?3, ?4)",
                params![id, name, group.to_string(), index as i64],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    if let Some(items) = value.get("collections").and_then(Value::as_array) {
        for (index, item) in items.iter().enumerate() {
            let id = item.get("id").and_then(Value::as_str).unwrap_or("");
            let collection_id = item.get("collectionId").and_then(Value::as_str).unwrap_or("");
            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
            let folder = item.get("folder").and_then(Value::as_str);
            conn.execute(
                "INSERT INTO workspace_requests (id, collection_id, name, folder, json, sort_index)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, collection_id, name, folder, item.to_string(), index as i64],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    if let Some(items) = value.get("environments").and_then(Value::as_array) {
        for (index, item) in items.iter().enumerate() {
            let id = item.get("id").and_then(Value::as_str).unwrap_or("");
            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
            conn.execute(
                "INSERT INTO workspace_environments (id, name, json, sort_index) VALUES (?1, ?2, ?3, ?4)",
                params![id, name, item.to_string(), index as i64],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let mut meta = value.clone();
    if let Some(obj) = meta.as_object_mut() {
        obj.remove("collectionGroups");
        obj.remove("collections");
        obj.remove("environments");
        obj.remove("history");
    }
    conn.execute(
        "INSERT INTO workspace_meta (id, json, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
        params![meta.to_string(), updated_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn assemble_workspace(conn: &Connection) -> Result<String, String> {
    let meta: String = conn
        .query_row("SELECT json FROM workspace_meta WHERE id = 1", [], |row| row.get(0))
        .unwrap_or_else(|_| "{}".into());
    let mut value: Value = serde_json::from_str(&meta).unwrap_or_else(|_| json!({}));
    let obj = value.as_object_mut().ok_or_else(|| "workspace meta is not an object".to_string())?;

    let mut groups = Vec::new();
    let mut stmt = conn
        .prepare("SELECT json FROM workspace_collections ORDER BY sort_index ASC")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let json: String = row.get(0).map_err(|e| e.to_string())?;
        groups.push(serde_json::from_str(&json).unwrap_or(Value::Null));
    }
    obj.insert("collectionGroups".into(), Value::Array(groups));

    let mut requests = Vec::new();
    let mut stmt = conn
        .prepare("SELECT json FROM workspace_requests ORDER BY sort_index ASC")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let json: String = row.get(0).map_err(|e| e.to_string())?;
        requests.push(serde_json::from_str(&json).unwrap_or(Value::Null));
    }
    obj.insert("collections".into(), Value::Array(requests));

    let mut environments = Vec::new();
    let mut stmt = conn
        .prepare("SELECT json FROM workspace_environments ORDER BY sort_index ASC")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let json: String = row.get(0).map_err(|e| e.to_string())?;
        environments.push(serde_json::from_str(&json).unwrap_or(Value::Null));
    }
    obj.insert("environments".into(), Value::Array(environments));
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn roundtrips_collections_through_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE workspace (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);",
        )
        .unwrap();
        migrate_workspace_tables(&conn).unwrap();
        let payload = r#"{"collectionGroups":[{"id":"c1","name":"API"}],"collections":[{"id":"r1","collectionId":"c1","name":"Get"}],"environments":[{"id":"e1","name":"Local"}],"globals":[]}"#;
        save_normalized_workspace(&conn, payload, "now").unwrap();
        let loaded = load_normalized_workspace(&conn).unwrap().unwrap();
        let value: Value = serde_json::from_str(&loaded).unwrap();
        assert_eq!(value["collectionGroups"][0]["id"], "c1");
        assert_eq!(value["collections"][0]["name"], "Get");
        assert_eq!(value["environments"][0]["name"], "Local");
    }
}
