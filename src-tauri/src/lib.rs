mod cache;
mod http;
mod settings;
mod state;

use http::{HttpRequestPayload, HttpResponsePayload};
use settings::AppSettings;
use state::HttpState;
use tauri::{AppHandle, State};

#[tauri::command]
async fn send_http_request(
    state: State<'_, HttpState>,
    payload: HttpRequestPayload,
) -> Result<HttpResponsePayload, String> {
    http::execute_request(state.inner(), payload).await
}

#[tauri::command]
fn clear_http_cache(state: State<'_, HttpState>) -> Result<u64, String> {
    Ok(http::clear_cache(&state.cache))
}

#[tauri::command]
fn get_http_cache_size(state: State<'_, HttpState>) -> Result<u64, String> {
    Ok(http::cache_size(&state.cache))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_state = HttpState::new().expect("failed to initialize HTTP state");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(http_state)
        .setup(|app| {
            let theme = settings::load_settings(app.handle())?.theme;
            settings::apply_native_theme(app.handle(), &theme)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_http_request,
            clear_http_cache,
            get_http_cache_size,
            get_theme,
            set_theme,
            get_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
