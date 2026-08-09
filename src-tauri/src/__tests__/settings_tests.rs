use super::*;

#[test]
fn normalize_theme_accepts_supported_values() {
    assert_eq!(normalize_theme("dark"), "dark");
    assert_eq!(normalize_theme("light"), "light");
    assert_eq!(normalize_theme("system"), "system");
    assert_eq!(normalize_theme("ocean"), "ocean");
    assert_eq!(normalize_theme("aurora"), "aurora");
    assert_eq!(normalize_theme("nord"), "nord");
    assert_eq!(normalize_theme("dracula"), "dracula");
    assert_eq!(normalize_theme("neon"), "neon");
}

#[test]
fn native_theme_for_custom_palettes() {
    assert_eq!(native_theme_for("ocean"), Some(Theme::Light));
    assert_eq!(native_theme_for("aurora"), Some(Theme::Dark));
    assert_eq!(native_theme_for("nord"), Some(Theme::Light));
    assert_eq!(native_theme_for("polar"), Some(Theme::Dark));
    assert_eq!(native_theme_for("system"), None);
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
    assert!(settings.http_ssl_verify);
    assert_eq!(settings.http_proxy, None);
    assert!(settings.http_follow_redirects);
    assert_eq!(settings.http_max_redirects, 10);
    assert_eq!(settings.http_user_agent, None);
    assert!(settings.http_send_cookies);
    assert!(settings.http_store_cookies);
    assert_eq!(settings.http_connect_timeout_ms, 10_000);
    assert_eq!(settings.http_default_origin, None);
    assert_eq!(settings.http_default_referer, None);
    assert_eq!(settings.custom_theme_css_path, None);
}

#[test]
fn apply_http_input_normalizes_values() {
    let mut settings = AppSettings::default();
    settings.apply_http_input(HttpSettingsInput {
        http_max_concurrent: 999,
        http_timeout_ms: 100,
        http_cache_enabled: false,
        http_cache_ttl_sec: 10,
        http_cache_disk_enabled: false,
        http_ssl_verify: false,
        http_proxy: Some("  http://127.0.0.1:8080  ".into()),
        http_follow_redirects: false,
        http_max_redirects: 99,
        http_user_agent: Some("  Pulse/1.0  ".into()),
        http_send_cookies: false,
        http_store_cookies: false,
        http_connect_timeout_ms: 50,
        http_default_origin: Some(" https://app.local ".into()),
        http_default_referer: Some("".into()),
    });

    assert_eq!(settings.http_max_concurrent, 256);
    assert_eq!(settings.http_timeout_ms, 1_000);
    assert!(!settings.http_cache_enabled);
    assert_eq!(settings.http_cache_ttl_sec, 30);
    assert!(!settings.http_ssl_verify);
    assert_eq!(settings.http_proxy.as_deref(), Some("http://127.0.0.1:8080"));
    assert!(!settings.http_follow_redirects);
    assert_eq!(settings.http_max_redirects, 50);
    assert_eq!(settings.http_user_agent.as_deref(), Some("Pulse/1.0"));
    assert!(!settings.http_send_cookies);
    assert!(!settings.http_store_cookies);
    assert_eq!(settings.http_connect_timeout_ms, 500);
    assert_eq!(settings.http_default_origin.as_deref(), Some("https://app.local"));
    assert_eq!(settings.http_default_referer, None);
}
