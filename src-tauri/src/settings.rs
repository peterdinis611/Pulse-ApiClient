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
        "light" | "dark" | "system" => theme.to_string(),
        _ => "system".to_string(),
    }
}

pub fn apply_native_theme(app: &AppHandle, theme: &str) -> Result<(), String> {
    let theme = normalize_theme(theme);
    let native_theme = match theme.as_str() {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None,
    };

    for (_, window) in app.webview_windows() {
        window.set_theme(native_theme).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_theme_accepts_supported_values() {
        assert_eq!(normalize_theme("dark"), "dark");
        assert_eq!(normalize_theme("light"), "light");
        assert_eq!(normalize_theme("system"), "system");
    }

    #[test]
    fn normalize_theme_falls_back_to_system() {
        assert_eq!(normalize_theme("invalid"), "system");
    }

    #[test]
    fn deserializes_partial_settings_with_defaults() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.theme, "dark");
        assert_eq!(settings.http_max_concurrent, 32);
        assert_eq!(settings.http_timeout_ms, 30_000);
        assert!(settings.http_cache_enabled);
        assert_eq!(settings.http_cache_ttl_sec, 900);
        assert!(settings.http_cache_disk_enabled);
    }
}
