use super::*;

#[test]
fn parses_post_json() {
    let payload = curl_to_payload(
        r#"curl -X POST https://api.example.com/users -H 'Content-Type: application/json' --data-raw '{"name":"Ada"}'"#,
    )
    .expect("parse");
    assert_eq!(payload.method, "POST");
    assert_eq!(payload.url, "https://api.example.com/users");
    assert_eq!(payload.body_kind, "json");
    assert!(payload.body.contains("Ada"));
}

#[test]
fn parses_bearer_and_basic() {
    let bearer = curl_to_payload(
        r#"curl https://api.example.com -H 'Authorization: Bearer tok_123'"#,
    )
    .expect("bearer");
    assert_eq!(bearer.auth.auth_type, "bearer");
    assert_eq!(bearer.auth.bearer_token.as_deref(), Some("tok_123"));

    let basic = curl_to_payload(r#"curl -u 'ada:secret' https://api.example.com"#).expect("basic");
    assert_eq!(basic.auth.auth_type, "basic");
    assert_eq!(basic.auth.basic_username.as_deref(), Some("ada"));
    assert_eq!(basic.auth.basic_password.as_deref(), Some("secret"));
}

#[test]
fn parses_json_flag_and_head() {
    let json = curl_to_payload(r#"curl --json '{"a":1}' https://api.example.com/x"#).expect("json");
    assert_eq!(json.method, "POST");
    assert_eq!(json.body_kind, "json");
    assert!(json
        .headers
        .iter()
        .any(|h| h.key.eq_ignore_ascii_case("content-type")));

    let head = curl_to_payload(r#"curl -I https://api.example.com"#).expect("head");
    assert_eq!(head.method, "HEAD");
}

#[test]
fn parses_form_multipart_and_get_data() {
    let form = curl_to_payload(
        r#"curl -X POST https://api.example.com --data-urlencode 'name=Ada' --data-urlencode 'role=dev'"#,
    )
    .expect("form");
    assert_eq!(form.body_kind, "form");
    assert_eq!(form.form.len(), 2);

    let multi = curl_to_payload(r#"curl -F 'file=@photo.png;type=image/png' -F 'note=hi' https://api.example.com/up"#)
        .expect("multipart");
    assert_eq!(multi.body_kind, "multipart");
    assert_eq!(multi.multipart.len(), 2);
    assert_eq!(multi.multipart[0].field_type, "file");

    let get = curl_to_payload(r#"curl -G -d 'q=pulse' https://api.example.com/search"#).expect("get");
    assert_eq!(get.method, "GET");
    assert_eq!(get.query.len(), 1);
    assert_eq!(get.query[0].key, "q");
}

#[test]
fn round_trips_export() {
    let original = curl_to_payload(
        r#"curl -X POST 'https://api.example.com/users?x=1' -H 'Accept: application/json' --data-raw '{"ok":true}'"#,
    )
    .expect("parse");
    let command = payload_to_curl(&original);
    assert!(command.contains("curl"));
    assert!(command.contains("-X"));
    assert!(command.contains("POST"));
    assert!(command.contains("--compressed"));
    let again = curl_to_payload(&command).expect("reparse");
    assert_eq!(again.method, "POST");
    assert!(again.url.contains("api.example.com/users"));
    assert!(again.body.contains("ok"));
}

#[test]
fn rejects_non_curl() {
    assert!(curl_to_payload("wget https://example.com").is_err());
}
