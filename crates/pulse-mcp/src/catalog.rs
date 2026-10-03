//! Tool catalog helpers for the Rust Pulse MCP server.

/// Tools added for parity with the Python MCP stream / contract surface.
pub const STREAM_AND_CONTRACT_TOOLS: &[&str] = &[
    "pulse_workspace_init",
    "pulse_workspace_migrate",
    "pulse_schema",
    "pulse_diff",
    "pulse_curl",
    "pulse_sse",
    "pulse_graphql_ws",
    "pulse_graphql",
    "pulse_agent",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_lists_new_tools() {
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_sse"));
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_graphql_ws"));
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_graphql"));
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_curl"));
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_diff"));
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_schema"));
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_agent"));
    }

    #[test]
    fn catalog_has_no_duplicates() {
        let mut seen = std::collections::HashSet::new();
        for name in STREAM_AND_CONTRACT_TOOLS {
            assert!(seen.insert(*name), "duplicate tool {name}");
        }
    }
}
