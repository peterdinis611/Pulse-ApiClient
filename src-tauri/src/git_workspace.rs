use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{recommended_watcher, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use pulse_core::types::SavedRequestDto;
use pulse_core::workspace_fs::{
    init_workspace, load_workspace, migrate_pulse_json_dumps, save_request, save_workspace, GitWorkspacePayload,
};

pub struct GitWatchState {
    inner: Mutex<Option<WatchSession>>,
}

struct WatchSession {
    _watcher: RecommendedWatcher,
    root: PathBuf,
}

impl Default for GitWatchState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileChanged {
    pub path: String,
    pub kind: String,
}

fn validate_root(root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root.trim());
    if root.trim().is_empty() || root.contains('\0') {
        return Err("Invalid workspace path".into());
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {root}"));
    }
    Ok(path)
}

fn overlay_keychain(payload: &mut GitWorkspacePayload) {
    for secret in &mut payload.secrets {
        if let Ok(Some(value)) = crate::secrets_store::secret_get(secret.key.clone()) {
            if !value.is_empty() {
                secret.value = value;
            }
        }
    }
}

pub fn open_workspace(root: &str, name: &str) -> Result<GitWorkspacePayload, String> {
    init_workspace(root, name)?;
    let _ = migrate_pulse_json_dumps(root);
    let mut payload = load_workspace(root)?;
    overlay_keychain(&mut payload);
    Ok(payload)
}

/// Reindex agent memory into the user SQLite DB when a workspace folder is attached.
pub fn reindex_agent_memory(db: &crate::db::DbState, root: &str) -> Result<usize, String> {
    db.with_user_conn(|conn| crate::agent_memory::reindex_workspace(conn, root))
}

pub fn load(root: &str) -> Result<GitWorkspacePayload, String> {
    let mut payload = load_workspace(root)?;
    overlay_keychain(&mut payload);
    Ok(payload)
}

pub fn save(root: &str, payload: GitWorkspacePayload) -> Result<GitWorkspacePayload, String> {
    save_workspace(root, &payload)?;
    load(root)
}

pub fn write_request(root: &str, saved: SavedRequestDto, group_name: String) -> Result<String, String> {
    save_request(root, &saved, &group_name)
}

pub fn migrate(root: &str) -> Result<Vec<String>, String> {
    migrate_pulse_json_dumps(root)
}

pub fn start_watch(app: AppHandle, state: &GitWatchState, root: &str) -> Result<(), String> {
    let root_path = validate_root(root)?;
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;

    let emit_root = root_path.clone();
    let handle = app.clone();
    let last = Mutex::new(Instant::now() - Duration::from_secs(1));
    let mut watcher = recommended_watcher(move |result: Result<Event, notify::Error>| {
        let Ok(event) = result else { return };
        if event.kind.is_access() {
            return;
        }
        let path = event
            .paths
            .first()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        if should_ignore(Path::new(&path)) {
            return;
        }
        // Trailing-ish debounce: ignore bursts, emit at most every 750ms.
        {
            let mut last = last.lock().unwrap_or_else(|e| e.into_inner());
            let now = Instant::now();
            if !watch_debounce_elapsed(*last, now, Duration::from_millis(750)) {
                return;
            }
            *last = now;
        }
        let kind = format!("{:?}", event.kind);
        let _ = handle.emit(
            "workspace-file-changed",
            WorkspaceFileChanged { path, kind },
        );
        let _ = emit_root;
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&root_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *guard = Some(WatchSession {
        _watcher: watcher,
        root: root_path,
    });
    Ok(())
}

pub fn stop_watch(state: &GitWatchState) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

fn should_ignore(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy())
        .unwrap_or_default();
    if matches!(
        file_name.as_ref(),
        "rag-index.json" | "Cargo.lock" | "package-lock.json" | "bun.lock" | "bun.lockb"
    ) {
        return true;
    }
    if file_name.ends_with(".pyc") || file_name.ends_with(".swp") || file_name.ends_with('~') {
        return true;
    }
    path.components().any(|part| {
        let name = part.as_os_str().to_string_lossy();
        matches!(
            name.as_ref(),
            ".git"
                | ".pulse"
                | "node_modules"
                | "target"
                | "dist"
                | "build"
                | ".venv"
                | "venv"
                | "__pycache__"
                | ".next"
                | "coverage"
                | ".turbo"
                | ".cache"
        )
    })
}

fn watch_debounce_elapsed(last: Instant, now: Instant, min: Duration) -> bool {
    now.duration_since(last) >= min
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::time::{Duration, Instant};

    #[test]
    fn ignores_git_and_pulse_dirs() {
        assert!(should_ignore(Path::new("/repo/.git/HEAD")));
        assert!(should_ignore(Path::new("/repo/.pulse/pending/x.json")));
        assert!(should_ignore(Path::new("/repo/target/debug/api-client")));
        assert!(should_ignore(Path::new("/repo/node_modules/x/index.js")));
        assert!(should_ignore(Path::new("/repo/.pulse/rag-index.json")));
        assert!(!should_ignore(Path::new("/repo/collections/a.pulse.yaml")));
    }

    #[test]
    fn debounce_skips_bursts() {
        let start = Instant::now();
        assert!(!watch_debounce_elapsed(start, start + Duration::from_millis(10), Duration::from_millis(250)));
        assert!(watch_debounce_elapsed(start, start + Duration::from_millis(300), Duration::from_millis(250)));
    }
}

pub fn current_root(state: &GitWatchState) -> Option<String> {
    state
        .inner
        .lock()
        .ok()?
        .as_ref()
        .map(|session| session.root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn git_workspace_open(
    app: AppHandle,
    root: String,
    name: Option<String>,
) -> Result<GitWorkspacePayload, String> {
    let payload = open_workspace(&root, name.as_deref().unwrap_or("Pulse"))?;
    if let Some(db) = app.try_state::<crate::db::DbState>() {
        let _ = reindex_agent_memory(db.inner(), &root);
        let _ = db.with_user_conn(|conn| {
            crate::agent_rag::rebuild_with_request_history(conn, &root)
        });
    }
    Ok(payload)
}

#[tauri::command]
pub fn git_workspace_load(root: String) -> Result<GitWorkspacePayload, String> {
    load(&root)
}

#[tauri::command]
pub fn git_workspace_save(root: String, payload: GitWorkspacePayload) -> Result<GitWorkspacePayload, String> {
    save(&root, payload)
}

#[tauri::command]
pub fn git_workspace_save_request(
    root: String,
    saved: SavedRequestDto,
    group_name: String,
) -> Result<String, String> {
    write_request(&root, saved, group_name)
}

#[tauri::command]
pub fn git_workspace_migrate(root: String) -> Result<Vec<String>, String> {
    migrate(&root)
}

#[tauri::command]
pub fn git_workspace_watch(app: AppHandle, state: State<GitWatchState>, root: String) -> Result<(), String> {
    start_watch(app, state.inner(), &root)
}

#[tauri::command]
pub fn git_workspace_unwatch(state: State<GitWatchState>) -> Result<(), String> {
    stop_watch(state.inner())
}

#[tauri::command]
pub fn git_workspace_read_file(root: String, relative: String) -> Result<String, String> {
    let dir = validate_root(&root)?;
    if relative.contains("..") || relative.contains('\0') {
        return Err("Invalid relative path".into());
    }
    let path = dir.join(relative);
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_workspace_pending(root: String) -> Result<Vec<String>, String> {
    pulse_core::workspace_fs::list_pending(&root)
}

#[tauri::command]
pub fn git_workspace_agent_history(root: String) -> Result<Vec<serde_json::Value>, String> {
    pulse_core::workspace_fs::read_agent_history(&root)
}

#[tauri::command]
pub fn git_workspace_append_agent_history(
    root: String,
    entry: serde_json::Value,
) -> Result<(), String> {
    pulse_core::workspace_fs::append_agent_history(&root, &entry)?;
    if let Some(doc) = pulse_core::doc_from_history_entry(&entry) {
        let _ = pulse_core::upsert_rag_docs(&root, &[doc]);
    }
    Ok(())
}
