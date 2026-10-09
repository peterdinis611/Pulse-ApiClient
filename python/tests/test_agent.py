import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.agent import route_agent_input, run_agent


class AgentRouterTests(unittest.TestCase):
    def test_routes_help_and_workspace(self) -> None:
        self.assertEqual(route_agent_input(""), {"kind": "help"})
        self.assertEqual(route_agent_input("workspace status"), {"kind": "workspace_status"})
        self.assertEqual(route_agent_input("agent history"), {"kind": "workspace_history"})

    def test_routes_curl_and_sse(self) -> None:
        curl = route_agent_input("curl https://example.com")
        self.assertEqual(curl["kind"], "import_curl")
        self.assertIn("curl", curl["curl"])

        sse = route_agent_input("event: ping\ndata: hi\n\n")
        self.assertEqual(sse["kind"], "sse_parse")
        self.assertIn("data: hi", sse["text"])

    def test_run_agent_help_and_desktop_only(self) -> None:
        help_result = run_agent("help", record_history=False)
        self.assertEqual(help_result["kind"], "help")
        self.assertIn("Import cURL", help_result["markdown"])

        desktop = run_agent("explain last response", record_history=False)
        self.assertEqual(desktop["kind"], "explain_response")
        self.assertTrue(desktop["data"]["desktopOnly"])

    def test_run_agent_curl(self) -> None:
        result = run_agent(
            "curl -X GET https://api.example.com/health",
            record_history=False,
        )
        self.assertEqual(result["kind"], "import_curl")
        self.assertEqual(result["data"]["method"], "GET")

    def test_memory_roundtrip(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            remembered = run_agent(
                "remember preferred_base_url=https://staging.test",
                workspace=tmp,
                record_history=False,
            )
            self.assertEqual(remembered["kind"], "remember")
            recalled = run_agent(
                "recall preferred_base_url",
                workspace=tmp,
                record_history=False,
            )
            self.assertIn("https://staging.test", recalled["markdown"])
            listed = run_agent("list memory", workspace=tmp, record_history=False)
            self.assertEqual(listed["kind"], "memory_list")
            forgot = run_agent(
                "forget preferred_base_url",
                workspace=tmp,
                record_history=False,
            )
            self.assertIn("Forgot", forgot["markdown"])

    def test_rag_intents(self) -> None:
        import tempfile

        self.assertEqual(route_agent_input("quick:rag"), {"kind": "rag_reindex"})
        self.assertEqual(
            route_agent_input("search history users list"),
            {"kind": "rag_search", "query": "users list"},
        )
        with tempfile.TemporaryDirectory() as tmp:
            run_agent(
                "remember preferred_env=staging-users-api",
                workspace=tmp,
                record_history=False,
            )
            reindexed = run_agent("reindex rag", workspace=tmp, record_history=False)
            self.assertEqual(reindexed["kind"], "rag_reindex")
            searched = run_agent(
                "search history staging-users",
                workspace=tmp,
                record_history=False,
            )
            self.assertEqual(searched["kind"], "rag_search")
            self.assertIn("RAG", searched["markdown"])


if __name__ == "__main__":
    unittest.main()
