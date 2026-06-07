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
