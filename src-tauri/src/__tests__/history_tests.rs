use super::*;
use rusqlite::Connection;

fn setup_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("open memory db");
    conn.execute_batch(
        "
        CREATE TABLE request_history (
          id TEXT PRIMARY KEY NOT NULL,
          sent_at TEXT NOT NULL,
          method TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL,
          request_json TEXT NOT NULL,
          status INTEGER,
          elapsed_ms INTEGER,
          size_bytes INTEGER
        );
        CREATE INDEX idx_request_history_sent_at ON request_history(sent_at DESC);
        ",
    )
    .expect("create history table");
    conn
}

fn sample_entry(id_suffix: &str, name: &str, url: &str) -> HistoryEntryPayload {
    HistoryEntryPayload {
        id: format!("hist_test_{id_suffix}"),
        sent_at: format!("2026-01-{id_suffix}T10:00:00.000Z"),
        request: serde_json::json!({
            "id": "req-1",
            "name": name,
            "url": url,
            "method": "GET",
            "protocol": "http",
            "headers": [],
            "query": [],
            "bodyKind": "none",
            "body": "",
            "form": [],
            "multipart": [],
            "auth": { "authType": "none" }
        }),
        response: Some(HistoryResponsePayload {
            status: 200,
            elapsed_ms: 12,
            size_bytes: 100,
        }),
    }
}

#[test]
fn lists_history_newest_first_with_pagination() {
    let conn = setup_conn();
    append_history_entry(&conn, &sample_entry("1", "First", "https://one.test")).expect("append 1");
    append_history_entry(&conn, &sample_entry("2", "Second", "https://two.test")).expect("append 2");
    append_history_entry(&conn, &sample_entry("3", "Third", "https://three.test")).expect("append 3");

    let page = list_history_page(&conn, 2, 0).expect("page");
    assert_eq!(page.total, 3);
    assert!(page.has_more);
    assert_eq!(page.items.len(), 2);
    assert_eq!(page.items[0].id, "hist_test_3");
    assert_eq!(page.items[1].id, "hist_test_2");

    let next = list_history_page(&conn, 2, 2).expect("next page");
    assert!(!next.has_more);
    assert_eq!(next.items[0].id, "hist_test_1");
}

#[test]
fn searches_history_by_name_and_url() {
    let conn = setup_conn();
    append_history_entry(&conn, &sample_entry("1", "Health check", "https://api.test/health"))
        .expect("append");
    append_history_entry(&conn, &sample_entry("2", "Users list", "https://api.test/users"))
        .expect("append");

    let results = search_history(&conn, "health", 10).expect("search");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "hist_test_1");
}

#[test]
fn rejects_sql_injection_in_history_id() {
    let conn = setup_conn();
    let mut entry = sample_entry("safe", "A", "https://a.test");
    entry.id = "hist_'; DROP TABLE request_history; --".to_string();
    assert!(append_history_entry(&conn, &entry).is_err());
}

#[test]
fn rejects_oversized_search_query() {
    let conn = setup_conn();
    let query = "a".repeat(300);
    assert!(search_history(&conn, &query, 10).is_err());
}

#[test]
fn trims_history_to_max_entries() {
    let conn = setup_conn();
    for index in 0..(HISTORY_MAX_ENTRIES + 25) {
        let entry = sample_entry(
            &format!("{:02}", index % 28 + 1),
            &format!("Request {index}"),
            &format!("https://api.test/{index}"),
        );
        let mut entry = entry;
        entry.id = format!("hist_entry_{index}");
        entry.sent_at = format!("2025-{:02}-15T10:00:00.000Z", (index % 28) + 1);
        append_history_entry(&conn, &entry).expect("append");
    }

    let total = history_count(&conn).expect("count");
    assert_eq!(total, HISTORY_MAX_ENTRIES as u64);
}

#[test]
fn clear_history_removes_all_rows() {
    let conn = setup_conn();
    append_history_entry(&conn, &sample_entry("1", "A", "https://a.test")).expect("append");
    clear_history(&conn).expect("clear");
    assert_eq!(history_count(&conn).expect("count"), 0);
}
