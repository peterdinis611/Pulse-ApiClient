use super::*;

#[test]
fn pending_window_init_roundtrip() {
    let label = "pulse-test-window";
    register_pending_window_init(
        label,
        Some("overview".to_string()),
        Some(serde_json::json!({ "name": "Imported request" })),
    )
    .expect("register should succeed");

    let init = take_pending_window_init(label).expect("init should exist");
    assert_eq!(init.main_view.as_deref(), Some("overview"));
    assert!(init.initial_request.is_some());
    assert!(take_pending_window_init(label).is_none());
}

#[test]
fn pending_window_init_overwrites_existing_label() {
    let label = "pulse-overwrite";
    register_pending_window_init(label, Some("request".to_string()), None).unwrap();
    register_pending_window_init(label, Some("overview".to_string()), None).unwrap();

    let init = take_pending_window_init(label).expect("init should exist");
    assert_eq!(init.main_view.as_deref(), Some("overview"));
}
