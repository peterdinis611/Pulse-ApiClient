use super::*;

#[test]
fn accepts_valid_history_ids() {
    assert!(validate_history_id("hist_550e8400-e29b-41d4-a716-446655440000").is_ok());
}

#[test]
fn rejects_sql_in_history_id() {
    assert!(validate_history_id("hist_'; DROP TABLE request_history; --").is_err());
    assert!(validate_history_id("bad_id").is_err());
}

#[test]
fn validates_cache_keys_as_hex() {
    assert!(validate_cache_key("a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789ab").is_ok());
    assert!(validate_cache_key("not-hex").is_err());
}

#[test]
fn sanitizes_search_query_length() {
    let long = "a".repeat(MAX_SEARCH_QUERY_LEN + 1);
    assert!(sanitize_fuzzy_query(&long).is_err());
    assert_eq!(sanitize_fuzzy_query("  health  ").unwrap(), "health");
}

#[test]
fn normalizes_http_methods() {
    assert_eq!(validate_http_method("get").unwrap(), "GET");
    assert!(validate_http_method("GET; DROP").is_err());
}

#[test]
fn filters_unsafe_batch_ids() {
    let ids = filter_safe_ids([
        "hist_ok",
        "hist_bad';",
        "hist_also_ok",
    ]);
    assert_eq!(ids, vec!["hist_ok", "hist_also_ok"]);
}
