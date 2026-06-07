use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbUserSession {
    pub id: String,
    pub name: String,
    pub email: String,
    pub initials: String,
    pub signed_in_at: String,
}

pub struct DiskCacheEntry {
    pub response_json: String,
    pub cached_at_ms: u64,
    pub expires_at_ms: u64,
}

pub struct DbState {
    conn: Mutex<Connection>,
}

impl DbState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let path = db_path(app)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        let state = Self {
            conn: Mutex::new(conn),
        };
        state.migrate()?;
        Ok(state)
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS accounts (
              id TEXT PRIMARY KEY NOT NULL,
              name TEXT NOT NULL,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              user_id TEXT NOT NULL,
              name TEXT NOT NULL,
              email TEXT NOT NULL,
              initials TEXT NOT NULL,
              signed_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspace (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS legacy_import (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              imported_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS http_response_cache (
              cache_key TEXT PRIMARY KEY NOT NULL,
              response_json TEXT NOT NULL,
              cached_at_ms INTEGER NOT NULL,
              expires_at_ms INTEGER NOT NULL,
              size_bytes INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_http_response_cache_expires
              ON http_response_cache(expires_at_ms);
            ",
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn cache_get(
        &self,
        key: &str,
        now_ms: u64,
    ) -> Result<Option<DiskCacheEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT response_json, cached_at_ms, expires_at_ms
                 FROM http_response_cache
                 WHERE cache_key = ?1 AND expires_at_ms > ?2",
            )
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query(params![key, now_ms as i64])
            .map_err(|e| e.to_string())?;

        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            return Ok(Some(DiskCacheEntry {
                response_json: row.get(0).map_err(|e| e.to_string())?,
                cached_at_ms: row.get::<_, i64>(1).map_err(|e| e.to_string())? as u64,
                expires_at_ms: row.get::<_, i64>(2).map_err(|e| e.to_string())? as u64,
            }));
        }

        Ok(None)
    }

    pub fn cache_put(
        &self,
        key: &str,
        response_json: &str,
        cached_at_ms: u64,
        expires_at_ms: u64,
        size_bytes: usize,
        max_entries: u64,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO http_response_cache (cache_key, response_json, cached_at_ms, expires_at_ms, size_bytes)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(cache_key) DO UPDATE SET
               response_json = excluded.response_json,
               cached_at_ms = excluded.cached_at_ms,
               expires_at_ms = excluded.expires_at_ms,
               size_bytes = excluded.size_bytes",
            params![
                key,
                response_json,
                cached_at_ms as i64,
                expires_at_ms as i64,
                size_bytes as i64
            ],
        )
        .map_err(|e| e.to_string())?;

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM http_response_cache", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if count as u64 > max_entries {
            let overflow = count as u64 - max_entries;
            conn.execute(
                "DELETE FROM http_response_cache
                 WHERE cache_key IN (
                   SELECT cache_key FROM http_response_cache
                   ORDER BY cached_at_ms ASC
                   LIMIT ?1
                 )",
                params![overflow as i64],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn cache_clear(&self) -> Result<u64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM http_response_cache", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM http_response_cache", [])
            .map_err(|e| e.to_string())?;
        Ok(count as u64)
    }

    pub fn cache_count(&self) -> Result<u64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM http_response_cache", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(count as u64)
    }

    pub fn cache_prune_expired(&self, now_ms: u64) -> Result<u64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let deleted = conn
            .execute(
                "DELETE FROM http_response_cache WHERE expires_at_ms <= ?1",
                params![now_ms as i64],
            )
            .map_err(|e| e.to_string())?;
        Ok(deleted as u64)
    }

    pub fn load_workspace(&self) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT payload FROM workspace WHERE id = 1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            return Ok(Some(row.get(0).map_err(|e| e.to_string())?));
        }
        Ok(None)
    }

    pub fn save_workspace(&self, payload: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let updated_at = chrono_now();
        conn.execute(
            "INSERT INTO workspace (id, payload, updated_at) VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
            params![payload, updated_at],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn register_account(
        &self,
        name: &str,
        email: &str,
        password: &str,
    ) -> Result<DbUserSession, String> {
        let name = name.trim();
        let email = normalize_email(email);
        if name.is_empty() {
            return Err("Enter your full name.".to_string());
        }
        if !email.contains('@') {
            return Err("Enter a valid email address.".to_string());
        }
        if password.len() < 6 {
            return Err("Password must be at least 6 characters.".to_string());
        }

        let id = format!("user_{}", uuid_simple());
        let password_hash = hash_password(password);
        let created_at = chrono_now();

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO accounts (id, name, email, password_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, email, password_hash, created_at],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE") {
                "An account with this email already exists.".to_string()
            } else {
                error.to_string()
            }
        })?;

        account_to_session(&id, name, &email)
    }

    pub fn login_account(&self, email: &str, password: &str) -> Result<DbUserSession, String> {
        let email = normalize_email(email);
        if email.is_empty() || password.is_empty() {
            return Err("Enter your email and password.".to_string());
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, email, password_hash FROM accounts WHERE email = ?1")
            .map_err(|e| e.to_string())?;
        let account = stmt
            .query_row(params![email], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|_| "No account found for this email.".to_string())?;

        if account.3 != hash_password(password) {
            return Err("Incorrect password.".to_string());
        }

        account_to_session(&account.0, &account.1, &account.2)
    }

    pub fn save_session(&self, session: &DbUserSession) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO sessions (id, user_id, name, email, initials, signed_at) VALUES (1, ?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, name = excluded.name, email = excluded.email,
             initials = excluded.initials, signed_at = excluded.signed_at",
            params![
                session.id,
                session.name,
                session.email,
                session.initials,
                session.signed_in_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_session(&self) -> Result<Option<DbUserSession>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT user_id, name, email, initials, signed_at FROM sessions WHERE id = 1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            return Ok(Some(DbUserSession {
                id: row.get(0).map_err(|e| e.to_string())?,
                name: row.get(1).map_err(|e| e.to_string())?,
                email: row.get(2).map_err(|e| e.to_string())?,
                initials: row.get(3).map_err(|e| e.to_string())?,
                signed_in_at: row.get(4).map_err(|e| e.to_string())?,
            }));
        }
        Ok(None)
    }

    pub fn clear_session(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM sessions WHERE id = 1", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn database_path(app: &AppHandle) -> Result<String, String> {
        db_path(app).map(|path| path.display().to_string())
    }

    pub fn reset_database(&self, app: &AppHandle) -> Result<(), String> {
        let path = db_path(app)?;
        self.swap_connection(Connection::open_in_memory().map_err(|e| e.to_string())?)?;
        remove_db_files(&path)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        self.swap_connection(Connection::open(&path).map_err(|e| e.to_string())?)?;
        self.migrate()?;
        Ok(())
    }

    fn swap_connection(&self, conn: Connection) -> Result<(), String> {
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        *guard = conn;
        Ok(())
    }
}

fn remove_db_files(path: &PathBuf) -> Result<(), String> {
    let base = path.to_string_lossy();
    for suffix in ["", "-wal", "-shm"] {
        let file_path = if suffix.is_empty() {
            path.clone()
        } else {
            PathBuf::from(format!("{base}{suffix}"))
        };
        if file_path.exists() {
            std::fs::remove_file(&file_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("pulse.db"))
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn initials(name: &str) -> String {
    let parts: Vec<_> = name.split_whitespace().filter(|part| !part.is_empty()).collect();
    if parts.is_empty() {
        return "PD".to_string();
    }
    if parts.len() == 1 {
        return parts[0].chars().take(2).collect::<String>().to_uppercase();
    }
    format!(
        "{}{}",
        parts[0].chars().next().unwrap_or_default(),
        parts[parts.len() - 1].chars().next().unwrap_or_default()
    )
    .to_uppercase()
}

fn account_to_session(id: &str, name: &str, email: &str) -> Result<DbUserSession, String> {
    Ok(DbUserSession {
        id: id.to_string(),
        name: name.to_string(),
        email: email.to_string(),
        initials: initials(name),
        signed_in_at: chrono_now(),
    })
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}

#[cfg(test)]
#[path = "__tests__/db_tests.rs"]
mod tests;
