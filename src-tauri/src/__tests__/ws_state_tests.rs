use super::*;

fn sample_handle(tab_id: &str) -> WsConnectionHandle {
    let (write_tx, _write_rx) = mpsc::unbounded_channel();
    let cancel = CancellationToken::new();
    let read_task = tokio::spawn(async {});
    WsConnectionHandle {
        tab_id: tab_id.to_string(),
        write_tx,
        cancel,
        read_task,
    }
}

#[test]
fn close_missing_connection_returns_false() {
    let state = WsState::new();
    assert!(!state.close_connection("missing"));
}

#[test]
fn close_existing_connection_returns_true() {
    let state = WsState::new();
    state.insert("conn-1".to_string(), sample_handle("tab-1"));
    assert!(state.close_connection("conn-1"));
    assert!(!state.close_connection("conn-1"));
}

#[test]
fn close_tab_connections_only_closes_matching_tab() {
    let state = WsState::new();
    state.insert("conn-a".to_string(), sample_handle("tab-1"));
    state.insert("conn-b".to_string(), sample_handle("tab-1"));
    state.insert("conn-c".to_string(), sample_handle("tab-2"));

    assert_eq!(state.close_tab_connections("tab-1"), 2);
    assert!(state.get_write_tx("conn-a").is_none());
    assert!(state.get_write_tx("conn-b").is_none());
    assert!(state.get_write_tx("conn-c").is_some());

    assert_eq!(state.close_tab_connections("tab-2"), 1);
    assert!(state.get_write_tx("conn-c").is_none());
}
