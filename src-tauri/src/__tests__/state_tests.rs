use super::*;

#[test]
fn records_and_lists_cookies() {
    let state = HttpState::default();
    state.record_set_cookies(
        "https://example.com",
        &[(
            "Set-Cookie".to_string(),
            "theme=dark; Path=/".to_string(),
        )],
    );

    let cookies = state.list_cookies();
    assert_eq!(cookies.len(), 1);
    assert_eq!(cookies[0].name, "theme");
    assert_eq!(cookies[0].value, "dark");
}

#[test]
fn clear_cookies_empties_log() {
    let state = HttpState::default();
    state.record_set_cookies(
        "https://example.com",
        &[("Set-Cookie".to_string(), "sid=1".to_string())],
    );
    state.clear_cookies().expect("clear should succeed");
    assert!(state.list_cookies().is_empty());
}
