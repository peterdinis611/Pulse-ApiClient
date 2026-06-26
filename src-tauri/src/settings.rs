use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Theme};

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_http_max_concurrent")]
    pub http_max_concurrent: u32,
    #[serde(default = "default_http_timeout_ms")]
    pub http_timeout_ms: u64,
    #[serde(default = "default_http_cache_enabled")]
    pub http_cache_enabled: bool,
    #[serde(default = "default_http_cache_ttl_sec")]
    pub http_cache_ttl_sec: u64,
    #[serde(default = "default_http_cache_disk_enabled")]
    pub http_cache_disk_enabled: bool,
    #[serde(default)]
    pub custom_theme_css_path: Option<String>,
}

fn default_http_cache_enabled() -> bool {
    true
}

fn default_http_cache_ttl_sec() -> u64 {
    900
}

fn default_http_cache_disk_enabled() -> bool {
    true
}

fn default_http_max_concurrent() -> u32 {
    32
}

fn default_http_timeout_ms() -> u64 {
    30_000
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            http_max_concurrent: default_http_max_concurrent(),
            http_timeout_ms: default_http_timeout_ms(),
            http_cache_enabled: default_http_cache_enabled(),
            http_cache_ttl_sec: default_http_cache_ttl_sec(),
            http_cache_disk_enabled: default_http_cache_disk_enabled(),
            custom_theme_css_path: None,
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(SETTINGS_FILE))
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn normalize_theme(theme: &str) -> String {
    match theme {
        "light"
        | "dark"
        | "system"
        | "ocean"
        | "forest"
        | "sunset"
        | "rose"
        | "sand"
        | "lavender"
        | "citrus"
        | "nord"
        | "paper"
        | "sky"
        | "blossom"
        | "midnight"
        | "graphite"
        | "amethyst"
        | "obsidian"
        | "ember"
        | "slate"
        | "aurora"
        | "polar"
        | "dracula"
        | "coffee"
        | "neon" => theme.to_string(),
        _ => "system".to_string(),
    }
}

fn native_theme_for(theme: &str) -> Option<Theme> {
    match theme {
        "dark" | "midnight" | "graphite" | "amethyst" | "obsidian" | "ember" | "slate" | "aurora"
        | "polar" | "dracula" | "coffee" | "neon" => {
            Some(Theme::Dark)
        }
        "light" | "ocean" | "forest" | "sunset" | "rose" | "sand" | "lavender" | "citrus" | "nord"
        | "paper" | "sky" | "blossom" => {
            Some(Theme::Light)
        }
        _ => None,
    }
}

pub fn apply_native_theme(app: &AppHandle, theme: &str) -> Result<(), String> {
    let theme = normalize_theme(theme);
    let native_theme = native_theme_for(&theme);

    for (_, window) in app.webview_windows() {
        window.set_theme(native_theme).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(test)]
#[path = "__tests__/settings_tests.rs"]
mod tests;
