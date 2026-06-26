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
    assert_eq!(settings.custom_theme_css_path, None);
}
