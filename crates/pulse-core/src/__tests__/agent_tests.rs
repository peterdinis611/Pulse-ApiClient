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
