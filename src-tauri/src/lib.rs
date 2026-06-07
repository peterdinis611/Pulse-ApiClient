mod cache;
mod engine;
mod http;
mod settings;
mod state;

use engine::HttpEngineStats;
use http::{BatchItemResult, HttpRequestPayload, HttpResponsePayload};
use settings::AppSettings;
use state::HttpState;
use tauri::{AppHandle, Manager, State};

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
    Ok(http::clear_cache(state.inner().cache()))
}

#[tauri::command]
fn get_http_cache_size(state: State<'_, HttpState>) -> Result<u64, String> {
    Ok(http::cache_size(state.inner().cache()))
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
) -> Result<AppSettings, String> {
    let mut settings = settings::load_settings(&app)?;
    settings.http_max_concurrent = http_max_concurrent.clamp(1, 256);
    settings.http_timeout_ms = http_timeout_ms.clamp(1_000, 600_000);
    settings::save_settings(&app, &settings)?;
    state.inner().apply_engine_settings(
        settings.http_max_concurrent as usize,
        settings.http_timeout_ms,
    );
    Ok(settings)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_settings = AppSettings::default();
    let http_state = HttpState::new(
        app_settings.http_max_concurrent as usize,
        app_settings.http_timeout_ms,
    )
    .expect("failed to initialize HTTP state");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(http_state)
        .setup(|app| {
            if let Ok(settings) = settings::load_settings(app.handle()) {
                let state = app.state::<HttpState>();
                state.apply_engine_settings(
                    settings.http_max_concurrent as usize,
                    settings.http_timeout_ms,
                );
                settings::apply_native_theme(app.handle(), &settings.theme)?;
            }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
