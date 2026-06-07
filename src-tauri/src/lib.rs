#[cfg(test)]
#[path = "__tests__/http_integration.rs"]
mod http_integration;

pub mod cache;
pub mod db;
pub mod engine;
pub mod http;
pub mod search;
pub mod settings;
pub mod state;
pub mod test_runner;
pub mod windows;

use cache::CacheConfig;
use db::{DbState, DbUserSession};
use engine::HttpEngineStats;
use http::{BatchItemResult, HttpRequestPayload, HttpResponsePayload};
use search::{SearchDocument, SearchMatch};
use settings::AppSettings;
use state::HttpState;
use std::sync::Arc;
use test_runner::TestRunResult;
use tauri::{AppHandle, Manager, State};
use windows::{AppWindowInfo, PendingWindowInit};

#[tauri::command]
async fn send_http_request(
    state: State<'_, HttpState>,
    payload: HttpRequestPayload,
) -> Result<HttpResponsePayload, String> {
    http::execute_request(state.inner(), payload).await
}

#[tauri::command]
async fn send_http_requests_batch(
    state: State<'_, HttpState>,
    payloads: Vec<HttpRequestPayload>,
) -> Result<Vec<BatchItemResult>, String> {
    Ok(http::execute_requests_batch(state.inner(), payloads).await)
}

#[tauri::command]
fn cancel_http_request(state: State<'_, HttpState>, request_id: String) -> Result<bool, String> {
    Ok(http::cancel_request(state.inner(), &request_id))
}

#[tauri::command]
fn cancel_all_http_requests(state: State<'_, HttpState>) -> Result<u64, String> {
    Ok(http::cancel_all_requests(state.inner()))
}

#[tauri::command]
fn get_http_engine_stats(state: State<'_, HttpState>) -> Result<HttpEngineStats, String> {
    Ok(http::engine_stats(state.inner()))
}

#[tauri::command]
fn clear_http_cache(state: State<'_, HttpState>) -> Result<u64, String> {
    Ok(http::clear_cache(state.inner()))
}

#[tauri::command]
fn get_http_cache_size(state: State<'_, HttpState>) -> Result<u64, String> {
    Ok(http::cache_size(state.inner()))
}

#[tauri::command]
fn get_theme(app: AppHandle) -> Result<String, String> {
    let settings = settings::load_settings(&app)?;
    Ok(settings::normalize_theme(&settings.theme))
}

#[tauri::command]
fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let theme = settings::normalize_theme(&theme);
    let mut settings = settings::load_settings(&app)?;
    settings.theme = theme.clone();
    settings::save_settings(&app, &settings)?;
    settings::apply_native_theme(&app, &theme)
}

#[tauri::command]
fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    settings::load_settings(&app)
}

#[tauri::command]
fn set_http_settings(
    app: AppHandle,
    state: State<'_, HttpState>,
    http_max_concurrent: u32,
    http_timeout_ms: u64,
    http_cache_enabled: bool,
    http_cache_ttl_sec: u64,
    http_cache_disk_enabled: bool,
) -> Result<AppSettings, String> {
    let mut settings = settings::load_settings(&app)?;
    settings.http_max_concurrent = http_max_concurrent.clamp(1, 256);
    settings.http_timeout_ms = http_timeout_ms.clamp(1_000, 600_000);
    settings.http_cache_enabled = http_cache_enabled;
    settings.http_cache_ttl_sec = http_cache_ttl_sec.clamp(30, 86_400);
    settings.http_cache_disk_enabled = http_cache_disk_enabled;
    settings::save_settings(&app, &settings)?;
    state.inner().apply_engine_settings(
        settings.http_max_concurrent as usize,
        settings.http_timeout_ms,
    );
    state
        .inner()
        .apply_cache_settings(CacheConfig::from_settings(&settings));
    Ok(settings)
}

#[tauri::command]
fn run_http_tests(
    script: String,
    response: HttpResponsePayload,
) -> Result<TestRunResult, String> {
    Ok(test_runner::run_http_tests(&script, &response))
}

#[tauri::command]
fn db_load_workspace(db: State<'_, Arc<DbState>>) -> Result<Option<String>, String> {
    db.load_workspace()
}

#[tauri::command]
fn db_save_workspace(db: State<'_, Arc<DbState>>, payload: String) -> Result<(), String> {
    db.save_workspace(&payload)
}

#[tauri::command]
fn db_load_session(db: State<'_, Arc<DbState>>) -> Result<Option<DbUserSession>, String> {
    db.load_session()
}

#[tauri::command]
fn db_save_session(db: State<'_, Arc<DbState>>, session: DbUserSession) -> Result<(), String> {
    db.save_session(&session)
}

#[tauri::command]
fn db_clear_session(db: State<'_, Arc<DbState>>) -> Result<(), String> {
    db.clear_session()
}

#[tauri::command]
fn db_get_database_path(app: AppHandle) -> Result<String, String> {
    DbState::database_path(&app)
}

#[tauri::command]
fn db_reset_database(
    app: AppHandle,
    db: State<'_, Arc<DbState>>,
    http: State<'_, HttpState>,
) -> Result<(), String> {
    db.reset_database(&app)?;
    http::clear_cache(http.inner());
    Ok(())
}

#[tauri::command]
fn db_register_account(
    db: State<'_, Arc<DbState>>,
    name: String,
    email: String,
    password: String,
) -> Result<DbUserSession, String> {
    db.register_account(&name, &email, &password)
}

#[tauri::command]
fn db_login_account(
    db: State<'_, Arc<DbState>>,
    email: String,
    password: String,
) -> Result<DbUserSession, String> {
    db.login_account(&email, &password)
}

#[tauri::command]
fn register_pending_window_init(
    label: String,
    main_view: Option<String>,
    initial_request: Option<serde_json::Value>,
) -> Result<(), String> {
    windows::register_pending_window_init(&label, main_view, initial_request)
}

#[tauri::command]
async fn create_app_window(
    app: AppHandle,
    title: Option<String>,
    main_view: Option<String>,
    initial_request: Option<serde_json::Value>,
) -> Result<AppWindowInfo, String> {
    windows::create_app_window(&app, title, main_view, initial_request)
}

#[tauri::command]
fn list_app_windows(app: AppHandle) -> Result<Vec<AppWindowInfo>, String> {
    Ok(windows::list_app_windows(&app))
}

#[tauri::command]
fn focus_app_window(app: AppHandle, label: String) -> Result<(), String> {
    windows::focus_app_window(&app, &label)
}

#[tauri::command]
fn close_app_window(app: AppHandle, label: String) -> Result<(), String> {
    windows::close_app_window(&app, &label)
}

#[tauri::command]
fn get_current_window_info(app: AppHandle, label: String) -> Result<AppWindowInfo, String> {
    windows::current_window_info(&app, &label)
}

#[tauri::command]
fn take_pending_window_init(label: String) -> Option<PendingWindowInit> {
    windows::take_pending_window_init(&label)
}

#[tauri::command]
fn set_window_title(app: AppHandle, label: String, title: String) -> Result<(), String> {
    windows::set_window_title(&app, &label, &title)
}

#[tauri::command]
fn fuzzy_search_documents(
    query: String,
    documents: Vec<SearchDocument>,
    limit: Option<usize>,
) -> Result<Vec<SearchMatch>, String> {
    Ok(search::fuzzy_search_documents(&query, &documents, limit))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_state = Arc::new(DbState::new(app.handle())?);
            let settings = settings::load_settings(app.handle()).unwrap_or_default();
            let http_state = HttpState::new(
                settings.http_max_concurrent as usize,
                settings.http_timeout_ms,
                CacheConfig::from_settings(&settings),
            )
            .map_err(|error| error.to_string())?;

            http_state.attach_disk_cache(db_state.clone());
            http_state.cache().prune_expired();

            app.manage(db_state);
            app.manage(http_state);
            settings::apply_native_theme(app.handle(), &settings.theme)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_http_request,
            send_http_requests_batch,
            cancel_http_request,
            cancel_all_http_requests,
            get_http_engine_stats,
            clear_http_cache,
            get_http_cache_size,
            get_theme,
            set_theme,
            get_app_settings,
            set_http_settings,
            run_http_tests,
            db_load_workspace,
            db_save_workspace,
            db_load_session,
            db_save_session,
            db_clear_session,
            db_get_database_path,
            db_reset_database,
            db_register_account,
            db_login_account,
            register_pending_window_init,
            create_app_window,
            list_app_windows,
            focus_app_window,
            close_app_window,
            get_current_window_info,
            take_pending_window_init,
            set_window_title,
            fuzzy_search_documents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
