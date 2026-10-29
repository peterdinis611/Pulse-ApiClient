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

/// Git porcelain + memory/RAG tools shared with the desktop agent surface.
pub const GIT_MEMORY_RAG_TOOLS: &[&str] = &[
    "pulse_git_status",
    "pulse_git_add",
    "pulse_git_commit",
    "pulse_git_diff_stat",
    "pulse_memory_list",
    "pulse_memory_get",
    "pulse_memory_search",
    "pulse_memory_upsert",
    "pulse_memory_delete",
    "pulse_rag_search",
    "pulse_rag_reindex",
    "pulse_rag_related",
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
    fn catalog_lists_git_memory_rag() {
        for name in GIT_MEMORY_RAG_TOOLS {
            assert!(!name.is_empty());
        }
        assert!(GIT_MEMORY_RAG_TOOLS.contains(&"pulse_git_status"));
        assert!(GIT_MEMORY_RAG_TOOLS.contains(&"pulse_memory_upsert"));
        assert!(GIT_MEMORY_RAG_TOOLS.contains(&"pulse_rag_search"));
    }

    #[test]
    fn catalog_has_no_duplicates() {
        let mut seen = std::collections::HashSet::new();
        for name in STREAM_AND_CONTRACT_TOOLS
            .iter()
            .chain(GIT_MEMORY_RAG_TOOLS.iter())
        {
            assert!(seen.insert(*name), "duplicate tool {name}");
        }
    }
}
