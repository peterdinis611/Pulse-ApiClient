use super::*;

#[test]
fn records_set_cookie_with_attributes() {
    let jar = CookieJarState::new();
    jar.record_set_cookies(
        "https://api.example.com/login",
        &[(
            "Set-Cookie".to_string(),
            "session=abc123; Path=/; Domain=.example.com".to_string(),
        )],
    );

    let cookies = jar.list();
    assert_eq!(cookies.len(), 1);
    assert_eq!(cookies[0].name, "session");
    assert_eq!(cookies[0].value, "abc123");
    assert_eq!(cookies[0].domain.as_deref(), Some(".example.com"));
    assert_eq!(cookies[0].path.as_deref(), Some("/"));
    assert_eq!(cookies[0].url, "https://api.example.com/login");
}

#[test]
fn ignores_non_set_cookie_headers() {
    let jar = CookieJarState::new();
    jar.record_set_cookies(
        "https://api.example.com",
        &[("Content-Type".to_string(), "application/json".to_string())],
    );
    assert!(jar.list().is_empty());
}

#[test]
fn replaces_cookie_with_same_name_for_url() {
    let jar = CookieJarState::new();
    let url = "https://api.example.com";
    jar.record_set_cookies(
        url,
        &[("set-cookie".to_string(), "token=old".to_string())],
    );
    jar.record_set_cookies(
        url,
        &[("set-cookie".to_string(), "token=new".to_string())],
    );

    let cookies = jar.list();
    assert_eq!(cookies.len(), 1);
    assert_eq!(cookies[0].value, "new");
}

#[test]
fn reset_clears_cookie_log() {
    let jar = CookieJarState::new();
    jar.record_set_cookies(
        "https://api.example.com",
        &[("Set-Cookie".to_string(), "sid=1".to_string())],
    );
    jar.reset();
    assert!(jar.list().is_empty());
}
