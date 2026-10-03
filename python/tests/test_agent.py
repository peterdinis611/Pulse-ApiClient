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


if __name__ == "__main__":
    unittest.main()
