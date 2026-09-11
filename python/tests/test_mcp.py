import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.mcp_protocol import TOOL_DEFS, handle_message


class McpProtocolTests(unittest.TestCase):
    def test_initialize_and_list_tools(self) -> None:
        init = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test"}},
            }
        )
        self.assertEqual(init["result"]["serverInfo"]["name"], "pulse")
        self.assertIsNone(handle_message({"jsonrpc": "2.0", "method": "notifications/initialized"}))
        listed = handle_message({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        names = {tool["name"] for tool in listed["result"]["tools"]}
        self.assertEqual(names, {tool["name"] for tool in TOOL_DEFS})
        self.assertIn("pulse_send", names)

    def test_schema_tool(self) -> None:
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "pulse_schema",
                    "arguments": {
                        "body": {"id": 1, "title": "ok"},
                        "schema": {"type": "object", "required": ["id"], "properties": {"id": {"type": "integer"}}},
                    },
                },
            }
        )
        self.assertEqual(result["result"]["content"][0]["text"], "ok")

    def test_openapi_tool_uses_examples(self) -> None:
        spec = Path(__file__).resolve().parents[1] / "examples" / "openapi.json"
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {"name": "pulse_openapi", "arguments": {"path": str(spec)}},
            }
        )
        payload = json.loads(result["result"]["content"][0]["text"])
        self.assertTrue(payload["collections"])
        self.assertEqual(payload["collectionGroups"][0]["name"], "JSONPlaceholder")

    def test_unknown_tool(self) -> None:
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {"name": "nope", "arguments": {}},
            }
        )
        self.assertEqual(result["error"]["code"], -32601)


if __name__ == "__main__":
    unittest.main()
