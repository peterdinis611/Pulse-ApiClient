import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pulse_cli
from pulse.git_cmd import git_status
from pulse.mcp_prompts import get_prompt, list_prompts
from pulse.mcp_protocol import TOOLS, handle_message
from pulse.memory import search_facts, upsert_fact


ROOT = Path(__file__).resolve().parents[1]


class GitCmdTests(unittest.TestCase):
    def test_status_on_repo(self) -> None:
        status = git_status(ROOT.parent if (ROOT.parent / ".git").is_dir() else ROOT)
        self.assertIn("branch", status)
        self.assertIn("files", status)


class CliGitMemoryRagTests(unittest.TestCase):
    def test_help_lists_git_and_memory(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["help"])
        self.assertEqual(code, 0)
        text = buf.getvalue()
        self.assertIn("git status", text)
        self.assertIn("agent-memory", text)
        self.assertIn("format-curl", text)

    def test_format_curl(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(
                [
                    "format-curl",
                    json.dumps({"method": "GET", "url": "https://api.example.com/health"}),
                ]
            )
        self.assertEqual(code, 0)
        self.assertIn("curl", buf.getvalue())
        self.assertIn("api.example.com/health", buf.getvalue())

    def test_git_status_cli(self) -> None:
        if not (ROOT.parent / ".git").is_dir():
            self.skipTest("not inside a git checkout")
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["git", "status", "--workspace", str(ROOT.parent), "--json"])
        self.assertEqual(code, 0)
        payload = json.loads(buf.getvalue())
        self.assertIn("branch", payload)

    def test_memory_search_and_rag_related(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            upsert_fact(root, key="env", value="staging", scope="workspace", source="test")
            facts = search_facts(root, "stag")
            self.assertEqual(len(facts), 1)
            self.assertEqual(facts[0]["key"], "env")

            buf = io.StringIO()
            with redirect_stdout(buf):
                code = pulse_cli.main(
                    ["agent-memory", "search", "stag", "--workspace", str(root), "--json"]
                )
            self.assertEqual(code, 0)
            payload = json.loads(buf.getvalue())
            self.assertEqual(payload["facts"][0]["key"], "env")

            buf = io.StringIO()
            with redirect_stdout(buf):
                code = pulse_cli.main(
                    ["agent-rag", "related", "staging", "--workspace", str(root), "--json"]
                )
            self.assertEqual(code, 0)
            related = json.loads(buf.getvalue())
            self.assertIn("hits", related)


class McpPythonExpansionTests(unittest.TestCase):
    def test_tools_and_prompts(self) -> None:
        self.assertIn("pulse_format_curl", TOOLS)
        self.assertIn("pulse_git_status", TOOLS)
        names = {item["name"] for item in list_prompts()}
        self.assertIn("git_status", names)
        self.assertIn("search_rag", names)
        self.assertIn("propose_commit", names)
        prompt = get_prompt("remember_fact", {"key": "env", "value": "prod"})
        self.assertIsNotNone(prompt)
        assert prompt is not None
        self.assertIn("pulse_memory_upsert", prompt["messages"][0]["content"]["text"])

    def test_format_curl_tool(self) -> None:
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "pulse_format_curl",
                    "arguments": {
                        "request": {"method": "GET", "url": "https://example.com/x"},
                    },
                },
            }
        )
        assert result is not None
        text = result["result"]["content"][0]["text"]
        self.assertIn("curl", text)
        self.assertIn("example.com/x", text)

    def test_git_status_tool(self) -> None:
        if not (ROOT.parent / ".git").is_dir():
            self.skipTest("not inside a git checkout")
        env = {**os.environ, "PULSE_WORKSPACE": str(ROOT.parent)}
        with mock.patch.dict(os.environ, env, clear=False):
            result = handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {"name": "pulse_git_status", "arguments": {}},
                }
            )
        assert result is not None
        payload = json.loads(result["result"]["content"][0]["text"])
        self.assertIn("branch", payload)


if __name__ == "__main__":
    unittest.main()
