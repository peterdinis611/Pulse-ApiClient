use super::*;
use std::fs;

fn temp_root(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "pulse-rag-{}-{}",
        label,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn cosine_identical_is_one() {
    let a = embed_text("GET /users health check");
    let b = embed_text("GET /users health check");
    assert!((cosine(&a, &b) - 1.0).abs() < 1e-5);
}

#[test]
fn ranks_related_history_higher() {
    let docs = vec![
        RagDocument {
            id: "1".into(),
            kind: "request".into(),
            text: "GET health https://api.test/health 200".into(),
            meta: None,
        },
        RagDocument {
            id: "2".into(),
            kind: "request".into(),
            text: "POST login https://api.test/auth/login 401".into(),
            meta: None,
        },
        RagDocument {
            id: "3".into(),
            kind: "fact".into(),
            text: "fact preferred_base_url https://staging.test".into(),
            meta: None,
        },
    ];
    let hits = search_documents(&docs, "auth login 401", 3);
    assert!(!hits.is_empty());
    assert_eq!(hits[0].id, "2");
}

#[test]
fn rebuild_and_search_roundtrip() {
    let root = temp_root("idx");
    let root_s = root.to_string_lossy().to_string();
    let extra = docs_from_request_rows(&[(
        "h1".into(),
        "2026-01-01T00:00:00Z".into(),
        "GET".into(),
        "Users".into(),
        "https://api.test/users".into(),
        Some(200),
    )]);
    let count = rebuild_rag_index(&root_s, &extra).unwrap();
    assert!(count >= 1);
    assert!(rag_index_path(&root_s).is_file());

    let hits = search_rag(&root_s, "users list", 5).unwrap();
    assert!(!hits.is_empty());
    assert!(hits[0].text.to_ascii_lowercase().contains("users"));
}

#[test]
fn hybrid_filters_method_and_status() {
    let docs = vec![
        RagDocument {
            id: "1".into(),
            kind: "request".into(),
            text: "GET users https://api.test/users 200".into(),
            meta: Some(serde_json::json!({"method":"GET","status":200,"url":"https://api.test/users"})),
        },
        RagDocument {
            id: "2".into(),
            kind: "request".into(),
            text: "POST login https://api.test/auth/login 500".into(),
            meta: Some(serde_json::json!({"method":"POST","status":500,"url":"https://api.test/auth/login"})),
        },
    ];
    let hits = search_documents(&docs, "method:POST status:5xx login", 5);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, "2");
}

#[test]
fn upsert_is_incremental() {
    let root = temp_root("upsert");
    let root_s = root.to_string_lossy().to_string();
    let count = upsert_rag_docs(
        &root_s,
        &[RagDocument {
            id: "req:a".into(),
            kind: "request".into(),
            text: "GET health https://api.test/health 200".into(),
            meta: None,
        }],
    )
    .unwrap();
    assert_eq!(count, 1);
    let count = upsert_rag_docs(
        &root_s,
        &[RagDocument {
            id: "req:b".into(),
            kind: "request".into(),
            text: "POST users https://api.test/users 201".into(),
            meta: None,
        }],
    )
    .unwrap();
    assert_eq!(count, 2);
    let hits = search_rag(&root_s, "users", 5).unwrap();
    assert!(hits.iter().any(|h| h.id == "req:b"));
}

#[test]
fn rich_request_doc_includes_graphql_op() {
    let doc = doc_from_request_history(
        "g1",
        "2026-01-01T00:00:00Z",
        "POST",
        "GQL",
        "https://api.test/graphql",
        Some(200),
        r#"{"method":"POST","bodyKind":"graphql","body":"query ListUsers { users { id } }"}"#,
    );
    assert!(
        doc.text.to_ascii_lowercase().contains("listusers"),
        "text={}",
        doc.text
    );
}
