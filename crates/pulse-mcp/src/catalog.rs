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
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_lists_new_tools() {
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_sse"));
        assert!(STREAM_AND_CONTRACT_TOOLS.contains(&"pulse_graphql_ws"));
    }
}
