use super::*;

#[test]
fn routes_help_and_empty() {
    assert_eq!(route_agent_input(""), AgentIntent::Help);
    assert_eq!(route_agent_input("help"), AgentIntent::Help);
    assert_eq!(route_agent_input("?"), AgentIntent::Help);
}

#[test]
fn routes_quick_and_natural() {
    assert_eq!(
        route_agent_input("quick:explain"),
        AgentIntent::ExplainResponse
    );
    assert_eq!(
        route_agent_input("explain last response"),
        AgentIntent::ExplainResponse
    );
    assert_eq!(route_agent_input("quick:tests"), AgentIntent::ExplainTests);
    assert_eq!(
        route_agent_input("workspace status"),
        AgentIntent::WorkspaceStatus
    );
    assert_eq!(
        route_agent_input("agent history"),
        AgentIntent::WorkspaceHistory
    );
    assert_eq!(
        route_agent_input("run active collection"),
        AgentIntent::RunCollection
    );
    assert_eq!(
        route_agent_input("graphql summarize"),
        AgentIntent::GraphqlSummarize
    );
}

#[test]
fn extracts_curl() {
    let intent = route_agent_input("curl -X GET https://api.example.com/v1");
    match intent {
        AgentIntent::ImportCurl { curl } => {
            assert!(curl.contains("curl"));
            assert!(curl.contains("api.example.com"));
        }
        other => panic!("expected import_curl, got {other:?}"),
    }

    let fenced = route_agent_input("```bash\ncurl https://example.com\n```");
    assert!(matches!(fenced, AgentIntent::ImportCurl { .. }));
}

#[test]
fn extracts_sse() {
    let intent = route_agent_input("event: ping\ndata: hi\n\n");
    match intent {
        AgentIntent::SseParse { text } => assert!(text.contains("data: hi")),
        other => panic!("expected sse_parse, got {other:?}"),
    }
}

#[test]
fn executes_curl_import() {
    let result = run_agent(
        "curl -X GET https://api.example.com/health",
        &AgentExecuteOptions {
            record_history: false,
            ..Default::default()
        },
    )
    .expect("run");
    assert_eq!(result.kind, "import_curl");
    let data = result.data.expect("payload");
    assert_eq!(data["method"], "GET");
    assert!(data["url"].as_str().unwrap().contains("health"));
}

#[test]
fn routes_memory_intents() {
    assert_eq!(route_agent_input("list memory"), AgentIntent::MemoryList);
    assert_eq!(route_agent_input("quick:memory"), AgentIntent::MemoryList);
    match route_agent_input("remember env=staging") {
        AgentIntent::Remember { key, value, scope } => {
            assert_eq!(key, "env");
            assert_eq!(value, "staging");
            assert_eq!(scope, "workspace");
        }
        other => panic!("expected remember, got {other:?}"),
    }
    match route_agent_input("remember secret=x --local") {
        AgentIntent::Remember { scope, .. } => assert_eq!(scope, "local"),
        other => panic!("expected remember local, got {other:?}"),
    }
    match route_agent_input("recall env") {
        AgentIntent::Recall { query } => assert_eq!(query, "env"),
        other => panic!("expected recall, got {other:?}"),
    }
    match route_agent_input("forget env") {
        AgentIntent::Forget { key } => assert_eq!(key, "env"),
        other => panic!("expected forget, got {other:?}"),
    }
}

#[test]
fn executes_memory_roundtrip() {
    let dir = std::env::temp_dir().join(format!(
        "pulse-agent-mem-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let root = dir.to_string_lossy().to_string();
    let opts = AgentExecuteOptions {
        workspace_root: Some(&root),
        record_history: false,
        ..Default::default()
    };
    let remembered = run_agent("remember preferred_base_url=https://staging.test", &opts).unwrap();
    assert_eq!(remembered.kind, "remember");
    let recalled = run_agent("recall preferred_base_url", &opts).unwrap();
    assert!(recalled.markdown.contains("https://staging.test"));
    let listed = run_agent("list memory", &opts).unwrap();
    assert_eq!(listed.kind, "memory_list");
    let forgot = run_agent("forget preferred_base_url", &opts).unwrap();
    assert!(forgot.markdown.contains("Forgot"));
}

#[test]
fn executes_sse_parse() {
    let result = run_agent(
        "event: ping\ndata: hi\nid: 1\n\n",
        &AgentExecuteOptions {
            record_history: false,
            ..Default::default()
        },
    )
    .expect("run");
    assert_eq!(result.kind, "sse_parse");
    let events = result.data.expect("events");
    assert_eq!(events.as_array().unwrap().len(), 1);
}

#[test]
fn desktop_only_intents_are_flagged() {
    let result = run_agent(
        "explain last response",
        &AgentExecuteOptions {
            record_history: false,
            ..Default::default()
        },
    )
    .expect("run");
    assert_eq!(result.kind, "explain_response");
    assert_eq!(result.data.unwrap()["desktopOnly"], true);
}
