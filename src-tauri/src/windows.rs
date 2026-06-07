use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingWindowInit {
    pub main_view: Option<String>,
    pub initial_request: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppWindowInfo {
    pub label: String,
    pub title: String,
    pub is_main: bool,
}

fn pending_inits() -> &'static Mutex<HashMap<String, PendingWindowInit>> {
    static STORE: OnceLock<Mutex<HashMap<String, PendingWindowInit>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn create_app_window(
    app: &AppHandle,
    title: Option<String>,
    main_view: Option<String>,
    initial_request: Option<Value>,
) -> Result<AppWindowInfo, String> {
    let label = format!("pulse-{}", uuid_simple());
    let window_title = title.unwrap_or_else(|| "Pulse API Client".to_string());

    if main_view.is_some() || initial_request.is_some() {
        pending_inits()
            .lock()
            .map_err(|error| error.to_string())?
            .insert(
                label.clone(),
                PendingWindowInit {
                    main_view,
                    initial_request,
                },
            );
    }

    WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(window_title.clone())
        .inner_size(1280.0, 840.0)
        .min_inner_size(960.0, 640.0)
        .build()
        .map_err(|error| format!("Failed to create window: {error}"))?;

    Ok(AppWindowInfo {
        label,
        title: window_title,
        is_main: false,
    })
}

pub fn list_app_windows(app: &AppHandle) -> Vec<AppWindowInfo> {
    app.webview_windows()
        .into_iter()
        .map(|(label, window)| AppWindowInfo {
            label: label.clone(),
            title: window.title().unwrap_or_else(|_| "Pulse API Client".to_string()),
            is_main: label == MAIN_WINDOW_LABEL,
        })
        .collect()
}

pub fn focus_app_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Window `{label}` not found"))?;
    window
        .set_focus()
        .map_err(|error| format!("Failed to focus window: {error}"))
}

pub fn close_app_window(app: &AppHandle, label: &str) -> Result<(), String> {
    if label == MAIN_WINDOW_LABEL {
        return Err("The main window cannot be closed from here.".to_string());
    }

    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Window `{label}` not found"))?;
    window
        .close()
        .map_err(|error| format!("Failed to close window: {error}"))
}

pub fn current_window_info(app: &AppHandle, label: &str) -> Result<AppWindowInfo, String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Window `{label}` not found"))?;
    Ok(AppWindowInfo {
        label: label.to_string(),
        title: window.title().unwrap_or_else(|_| "Pulse API Client".to_string()),
        is_main: label == MAIN_WINDOW_LABEL,
    })
}

pub fn take_pending_window_init(label: &str) -> Option<PendingWindowInit> {
    pending_inits()
        .lock()
        .ok()
        .and_then(|mut store| store.remove(label))
}

pub fn set_window_title(app: &AppHandle, label: &str, title: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Window `{label}` not found"))?;
    window
        .set_title(title)
        .map_err(|error| format!("Failed to set window title: {error}"))
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}
