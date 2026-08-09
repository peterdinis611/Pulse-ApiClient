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
    #[serde(default = "default_http_ssl_verify")]
    pub http_ssl_verify: bool,
    #[serde(default)]
    pub http_proxy: Option<String>,
    #[serde(default = "default_http_follow_redirects")]
    pub http_follow_redirects: bool,
    #[serde(default = "default_http_max_redirects")]
    pub http_max_redirects: u32,
    #[serde(default)]
    pub http_user_agent: Option<String>,
    #[serde(default = "default_true")]
    pub http_send_cookies: bool,
    #[serde(default = "default_true")]
    pub http_store_cookies: bool,
    #[serde(default = "default_http_connect_timeout_ms")]
    pub http_connect_timeout_ms: u64,
    #[serde(default)]
    pub http_default_origin: Option<String>,
    #[serde(default)]
    pub http_default_referer: Option<String>,
    #[serde(default)]
    pub custom_theme_css_path: Option<String>,
}

/// Payload accepted by `set_http_settings` (camelCase from the UI).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpSettingsInput {
    pub http_max_concurrent: u32,
    pub http_timeout_ms: u64,
    pub http_cache_enabled: bool,
    pub http_cache_ttl_sec: u64,
    pub http_cache_disk_enabled: bool,
    pub http_ssl_verify: bool,
    pub http_proxy: Option<String>,
    pub http_follow_redirects: bool,
    pub http_max_redirects: u32,
    pub http_user_agent: Option<String>,
    pub http_send_cookies: bool,
    pub http_store_cookies: bool,
    pub http_connect_timeout_ms: u64,
    pub http_default_origin: Option<String>,
    pub http_default_referer: Option<String>,
}

#[derive(Debug, Clone)]
pub struct HttpClientConfig {
    pub ssl_verify: bool,
    pub proxy: Option<String>,
    pub follow_redirects: bool,
    pub max_redirects: u32,
    pub user_agent: Option<String>,
    pub send_cookies: bool,
    pub store_cookies: bool,
    pub connect_timeout_ms: u64,
    pub default_origin: Option<String>,
    pub default_referer: Option<String>,
}

fn default_true() -> bool {
    true
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

fn default_http_ssl_verify() -> bool {
    true
}

fn default_http_follow_redirects() -> bool {
    true
}

fn default_http_max_redirects() -> u32 {
    10
}

fn default_http_connect_timeout_ms() -> u64 {
    10_000
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

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|raw| !raw.is_empty())
}

impl AppSettings {
    pub fn apply_http_input(&mut self, input: HttpSettingsInput) {
        self.http_max_concurrent = input.http_max_concurrent.clamp(1, 256);
        self.http_timeout_ms = input.http_timeout_ms.clamp(1_000, 600_000);
        self.http_cache_enabled = input.http_cache_enabled;
        self.http_cache_ttl_sec = input.http_cache_ttl_sec.clamp(30, 86_400);
        self.http_cache_disk_enabled = input.http_cache_disk_enabled;
        self.http_ssl_verify = input.http_ssl_verify;
        self.http_proxy = normalize_optional_string(input.http_proxy);
        self.http_follow_redirects = input.http_follow_redirects;
        self.http_max_redirects = input.http_max_redirects.clamp(0, 50);
        self.http_user_agent = normalize_optional_string(input.http_user_agent);
        self.http_send_cookies = input.http_send_cookies;
        self.http_store_cookies = input.http_store_cookies;
        self.http_connect_timeout_ms = input.http_connect_timeout_ms.clamp(500, 120_000);
        self.http_default_origin = normalize_optional_string(input.http_default_origin);
        self.http_default_referer = normalize_optional_string(input.http_default_referer);
    }

    pub fn client_config(&self) -> HttpClientConfig {
        HttpClientConfig {
            ssl_verify: self.http_ssl_verify,
            proxy: self.http_proxy.clone(),
            follow_redirects: self.http_follow_redirects,
            max_redirects: self.http_max_redirects,
            user_agent: self.http_user_agent.clone(),
            send_cookies: self.http_send_cookies,
            store_cookies: self.http_store_cookies,
            connect_timeout_ms: self.http_connect_timeout_ms,
            default_origin: self.http_default_origin.clone(),
            default_referer: self.http_default_referer.clone(),
        }
    }
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
            http_ssl_verify: default_http_ssl_verify(),
            http_proxy: None,
            http_follow_redirects: default_http_follow_redirects(),
            http_max_redirects: default_http_max_redirects(),
            http_user_agent: None,
            http_send_cookies: true,
            http_store_cookies: true,
            http_connect_timeout_ms: default_http_connect_timeout_ms(),
            http_default_origin: None,
            http_default_referer: None,
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
