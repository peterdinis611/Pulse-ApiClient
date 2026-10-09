use super::*;
use std::fs;

fn temp_root(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "pulse-mem-{}-{}",
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
fn upsert_get_delete_workspace_roundtrip() {
    let root = temp_root("ws");
    let root_s = root.to_string_lossy().to_string();

    let fact = upsert_fact(
        &root_s,
        UpsertFactInput {
            key: "Preferred Base URL",
            value: "https://staging.example.com",
            scope: MemoryScope::Workspace,
            source: "test",
            tags: vec!["env".into(), "http".into()],
            note: Some("use staging"),
            expires_at: None,
        },
    )
    .expect("upsert");

    assert_eq!(fact.key, "preferred_base_url");
    assert!(workspace_facts_path(&root_s).is_file());
    assert!(!local_facts_path(&root_s).exists());

    let loaded = get_fact(&root_s, "preferred_base_url", Some(MemoryScope::Workspace))
        .unwrap()
        .expect("found");
    assert_eq!(loaded.value, "https://staging.example.com");
    assert_eq!(loaded.tags, vec!["env", "http"]);

    assert!(delete_fact(&root_s, "preferred_base_url", Some(MemoryScope::Workspace)).unwrap());
    assert!(get_fact(&root_s, "preferred_base_url", None).unwrap().is_none());
}

#[test]
fn local_scope_stays_out_of_workspace_yaml() {
    let root = temp_root("local");
    let root_s = root.to_string_lossy().to_string();

    upsert_fact(
        &root_s,
        UpsertFactInput {
            key: "api_token_hint",
            value: "never commit",
            scope: MemoryScope::Local,
            source: "cli",
            tags: vec![],
            note: None,
            expires_at: None,
        },
    )
    .unwrap();

    assert!(!workspace_facts_path(&root_s).exists());
    assert!(local_facts_path(&root_s).is_file());

    let all = list_facts(&root_s, None).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].scope, MemoryScope::Local);
}

#[test]
fn search_and_overwrite() {
    let root = temp_root("search");
    let root_s = root.to_string_lossy().to_string();
    upsert_fact(
        &root_s,
        UpsertFactInput {
            key: "env",
            value: "staging",
            scope: MemoryScope::Workspace,
            source: "user",
            tags: vec!["deploy".into()],
            note: None,
            expires_at: None,
        },
    )
    .unwrap();
    upsert_fact(
        &root_s,
        UpsertFactInput {
            key: "env",
            value: "production",
            scope: MemoryScope::Workspace,
            source: "user",
            tags: vec!["deploy".into()],
            note: None,
            expires_at: None,
        },
    )
    .unwrap();

    let facts = list_facts(&root_s, Some(MemoryScope::Workspace)).unwrap();
    assert_eq!(facts.len(), 1);
    assert_eq!(facts[0].value, "production");

    let found = search_facts(&root_s, "deploy").unwrap();
    assert_eq!(found.len(), 1);
}

#[test]
fn parse_remember_pair_shapes() {
    assert_eq!(
        parse_remember_pair("foo=bar"),
        Some(("foo".into(), "bar".into()))
    );
    assert_eq!(
        parse_remember_pair("base_url: https://x.test"),
        Some(("base_url".into(), "https://x.test".into()))
    );
    assert_eq!(
        parse_remember_pair("preferred base url is https://staging"),
        Some(("preferred base url".into(), "https://staging".into()))
    );
}

#[test]
fn expired_facts_are_hidden_and_pruned() {
    let root = temp_root("ttl");
    let root_s = root.to_string_lossy().to_string();
    upsert_fact(
        &root_s,
        UpsertFactInput {
            key: "temp_token",
            value: "x",
            scope: MemoryScope::Local,
            source: "test",
            tags: vec![],
            note: None,
            expires_at: Some("1000000000.000Z"), // clearly in the past
        },
    )
    .unwrap();
    assert!(list_facts(&root_s, Some(MemoryScope::Local)).unwrap().is_empty());
    let removed = prune_expired_facts(&root_s).unwrap();
    assert!(removed >= 1);
}
