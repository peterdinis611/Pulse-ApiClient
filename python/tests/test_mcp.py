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
        self.assertIn("resources", init["result"]["capabilities"])
        self.assertIn("prompts", init["result"]["capabilities"])
        self.assertIsNone(handle_message({"jsonrpc": "2.0", "method": "notifications/initialized"}))
        listed = handle_message({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        names = {tool["name"] for tool in listed["result"]["tools"]}
        self.assertEqual(names, {tool["name"] for tool in TOOL_DEFS})
        self.assertIn("pulse_send", names)
        self.assertIn("pulse_write_collection", names)
        self.assertIn("pulse_pre_request", names)
        self.assertIn("pulse_bench", names)
        self.assertIn("pulse_diff", names)
        self.assertIn("pulse_curl", names)
        self.assertIn("pulse_export_openapi", names)
        self.assertIn("pulse_help", names)
        self.assertIn("pulse_last_run", names)
        self.assertIn("pulse_graphql", names)
        self.assertIn("pulse_snippet", names)
        self.assertIn("pulse_validate_run", names)
        self.assertIn("pulse_workspace_list", names)
        self.assertIn("pulse_workspace_read", names)
        self.assertIn("pulse_workspace_write", names)

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
                "params": {"name": "pulse_openapi", "arguments": {"path": str(spec), "inline": True}},
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

    def test_resources_list_and_read_examples(self) -> None:
        listed = handle_message({"jsonrpc": "2.0", "id": 6, "method": "resources/list"})
        uris = {item["uri"] for item in listed["result"]["resources"]}
        self.assertIn("pulse://last-run", uris)
        self.assertIn("pulse://examples/pets.json", uris)
        templates = handle_message({"jsonrpc": "2.0", "id": 7, "method": "resources/templates/list"})
        uris = {item["uriTemplate"] for item in templates["result"]["resourceTemplates"]}
        self.assertIn("pulse://openapi/{file}", uris)
        self.assertIn("pulse://out/{file}", uris)
        pets = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 8,
                "method": "resources/read",
                "params": {"uri": "pulse://examples/pets.json"},
            }
        )
        payload = json.loads(pets["result"]["contents"][0]["text"])
        self.assertEqual(payload["collectionGroups"][0]["name"], "jsonplaceholder")
        spec = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 9,
                "method": "resources/read",
                "params": {"uri": "pulse://openapi/openapi.json"},
            }
        )
        self.assertIn("openapi", spec["result"]["contents"][0]["text"])
        missing = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "resources/read",
                "params": {"uri": "pulse://examples/../../Cargo.toml"},
            }
        )
        self.assertEqual(missing["error"]["code"], -32002)

    def test_write_collection_and_last_run_resource(self) -> None:
        from pulse.mcp_resources import LAST_RUN_PATH, OUT_DIR, save_last_run

        written = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 11,
                "method": "tools/call",
                "params": {
                    "name": "pulse_write_collection",
                    "arguments": {
                        "name": "mcp-test-col",
                        "collection": {
                            "version": 1,
                            "collectionGroups": [{"id": "col_x", "name": "mcp-test-col", "folders": []}],
                            "collections": [],
                        },
                    },
                },
            }
        )
        info = json.loads(written["result"]["content"][0]["text"])
        self.assertEqual(info["path"], "python/examples/.out/mcp-test-col.json")
        self.assertTrue((OUT_DIR / "mcp-test-col.json").is_file())
        save_last_run({"collectionName": "mcp-test-col", "passed": 1, "failed": 0, "steps": []})
        last = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 12,
                "method": "resources/read",
                "params": {"uri": "pulse://last-run"},
            }
        )
        body = json.loads(last["result"]["contents"][0]["text"])
        self.assertEqual(body["collectionName"], "mcp-test-col")
        self.assertTrue(LAST_RUN_PATH.is_file())

    def test_openapi_writes_file_by_default(self) -> None:
        spec = Path(__file__).resolve().parents[1] / "examples" / "openapi.json"
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 13,
                "method": "tools/call",
                "params": {"name": "pulse_openapi", "arguments": {"path": str(spec), "name": "from-openapi-test"}},
            }
        )
        info = json.loads(result["result"]["content"][0]["text"])
        self.assertEqual(info["path"], "python/examples/.out/from-openapi-test.json")
        self.assertGreater(info["requests"], 0)

    def test_prompts_list_and_get(self) -> None:
        listed = handle_message({"jsonrpc": "2.0", "id": 14, "method": "prompts/list"})
        names = {item["name"] for item in listed["result"]["prompts"]}
        self.assertEqual(
            names,
            {
                "run_and_explain",
                "openapi_to_pulse",
                "compare_responses",
                "graphql_introspect",
                "curl_import",
                "export_openapi",
                "explain_last_run",
                "validate_schema",
            },
        )
        got = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 15,
                "method": "prompts/get",
                "params": {
                    "name": "run_and_explain",
                    "arguments": {"path": "python/examples/pets.json"},
                },
            }
        )
        text = got["result"]["messages"][0]["content"]["text"]
        self.assertIn("pulse_run_collection", text)
        self.assertIn("pets.json", text)
        openapi = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 16,
                "method": "prompts/get",
                "params": {"name": "openapi_to_pulse", "arguments": {"path": "python/examples/openapi.json"}},
            }
        )
        openapi_text = openapi["result"]["messages"][0]["content"]["text"]
        self.assertIn("pulse_openapi", openapi_text)
        self.assertIn("pulse_run_collection", openapi_text)
        compare = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 17,
                "method": "prompts/get",
                "params": {
                    "name": "compare_responses",
                    "arguments": {
                        "a": "https://jsonplaceholder.typicode.com/posts/1",
                        "b": "https://jsonplaceholder.typicode.com/posts/2",
                    },
                },
            }
        )
        compare_text = compare["result"]["messages"][0]["content"]["text"]
        self.assertIn("pulse_send", compare_text)
        self.assertIn("pulse_diff", compare_text)
        gql = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 18,
                "method": "prompts/get",
                "params": {"name": "graphql_introspect", "arguments": {"url": "https://api.test/graphql"}},
            }
        )
        self.assertIn("pulse_graphql", gql["result"]["messages"][0]["content"]["text"])
        missing = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 19,
                "method": "prompts/get",
                "params": {"name": "nope"},
            }
        )
        self.assertEqual(missing["error"]["code"], -32602)

    def test_bench_missing_collection(self) -> None:
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 19,
                "method": "tools/call",
                "params": {"name": "pulse_bench", "arguments": {"path": "no-such-collection.json"}},
            }
        )
        self.assertTrue(result["result"]["isError"])
        self.assertIn("No such collection", result["result"]["content"][0]["text"])

    def test_progress_notifications(self) -> None:
        from pulse.mcp_protocol import _notify, _progress_token, emit_step

        notes: list[dict] = []
        notify_token = _notify.set(notes.append)
        progress_token = _progress_token.set("tok-1")
        try:
            emit_step(
                {
                    "index": 1,
                    "total": 2,
                    "name": "Get user",
                    "status": "ok",
                    "ms": 12,
                    "failed": 0,
                }
            )
        finally:
            _notify.reset(notify_token)
            _progress_token.reset(progress_token)
        methods = [item["method"] for item in notes]
        self.assertEqual(methods, ["notifications/progress", "notifications/pulse/step"])
        self.assertEqual(notes[0]["params"]["progressToken"], "tok-1")
        self.assertEqual(notes[0]["params"]["progress"], 1)
        self.assertEqual(notes[0]["params"]["total"], 2)
        self.assertIn("Get user", notes[0]["params"]["message"])
        self.assertEqual(notes[1]["params"]["name"], "Get user")
        self.assertEqual(notes[1]["params"]["ms"], 12)

    def test_diff_curl_help_snippet(self) -> None:
        diff = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 30,
                "method": "tools/call",
                "params": {
                    "name": "pulse_diff",
                    "arguments": {"a": {"id": 1, "name": "ada"}, "b": {"id": 1, "name": "grace"}},
                },
            }
        )
        body = json.loads(diff["result"]["content"][0]["text"])
        self.assertFalse(body["equal"])
        self.assertGreater(body["added"] + body["removed"], 0)
        curl = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 31,
                "method": "tools/call",
                "params": {
                    "name": "pulse_curl",
                    "arguments": {
                        "command": "curl -X POST 'https://api.test/pets' -H 'Content-Type: application/json' -d '{\"n\":1}'"
                    },
                },
            }
        )
        payload = json.loads(curl["result"]["content"][0]["text"])
        self.assertEqual(payload["method"], "POST")
        self.assertEqual(payload["url"], "https://api.test/pets")
        self.assertEqual(payload["bodyKind"], "json")
        snippet = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 32,
                "method": "tools/call",
                "params": {
                    "name": "pulse_snippet",
                    "arguments": {"method": "GET", "url": "https://api.test/pets", "format": "curl"},
                },
            }
        )
        self.assertIn("curl", snippet["result"]["content"][0]["text"])
        self.assertIn("https://api.test/pets", snippet["result"]["content"][0]["text"])
        help_msg = handle_message(
            {"jsonrpc": "2.0", "id": 33, "method": "tools/call", "params": {"name": "pulse_help", "arguments": {}}}
        )
        catalog = json.loads(help_msg["result"]["content"][0]["text"])
        tool_names = {item["name"] for item in catalog["tools"]}
        self.assertIn("pulse_diff", tool_names)
        self.assertIn("graphql_introspect", {item["name"] for item in catalog["prompts"]})
        self.assertIn("pulse://out/{file}", catalog["resourceTemplates"])

    def test_export_openapi_last_run_and_validate(self) -> None:
        from pulse.mcp_resources import OUT_DIR, save_last_run

        pets = Path(__file__).resolve().parents[1] / "examples" / "pets.json"
        exported = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 34,
                "method": "tools/call",
                "params": {
                    "name": "pulse_export_openapi",
                    "arguments": {"path": str(pets), "inline": True},
                },
            }
        )
        spec = json.loads(exported["result"]["content"][0]["text"])
        self.assertEqual(spec["openapi"], "3.0.3")
        self.assertTrue(spec["paths"])
        written = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 35,
                "method": "tools/call",
                "params": {
                    "name": "pulse_export_openapi",
                    "arguments": {"path": str(pets), "name": "mcp-openapi-export"},
                },
            }
        )
        info = json.loads(written["result"]["content"][0]["text"])
        self.assertEqual(info["path"], "python/examples/.out/mcp-openapi-export.json")
        self.assertTrue((OUT_DIR / "mcp-openapi-export.json").is_file())
        listed = handle_message({"jsonrpc": "2.0", "id": 36, "method": "resources/list"})
        uris = {item["uri"] for item in listed["result"]["resources"]}
        self.assertIn("pulse://out/mcp-openapi-export.json", uris)
        out = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 37,
                "method": "resources/read",
                "params": {"uri": "pulse://out/mcp-openapi-export.json"},
            }
        )
        self.assertIn("openapi", out["result"]["contents"][0]["text"])
        save_last_run(
            {
                "collectionName": "schema-col",
                "passed": 1,
                "failed": 0,
                "steps": [
                    {
                        "saved": {"name": "Get post 1"},
                        "response": {"body": '{"id": 1, "title": "ok"}'},
                    }
                ],
            }
        )
        last = handle_message(
            {"jsonrpc": "2.0", "id": 38, "method": "tools/call", "params": {"name": "pulse_last_run", "arguments": {}}}
        )
        summary = json.loads(last["result"]["content"][0]["text"])
        self.assertEqual(summary["collection"], "schema-col")
        self.assertEqual(summary["requests"], 1)
        ok = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 39,
                "method": "tools/call",
                "params": {
                    "name": "pulse_validate_run",
                    "arguments": {
                        "body": {"id": 1},
                        "schema": {"type": "object", "required": ["id"], "properties": {"id": {"type": "integer"}}},
                    },
                },
            }
        )
        self.assertEqual(ok["result"]["content"][0]["text"], "ok")
        run_ok = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 40,
                "method": "tools/call",
                "params": {
                    "name": "pulse_validate_run",
                    "arguments": {
                        "result": {
                            "steps": [
                                {
                                    "saved": {
                                        "name": "Get post 1",
                                        "request": {
                                            "responseSchema": '{"type":"object","required":["id"],"properties":{"id":{"type":"integer"}}}'
                                        },
                                    },
                                    "response": {"body": '{"id": 1}'},
                                }
                            ]
                        }
                    },
                },
            }
        )
        report = json.loads(run_ok["result"]["content"][0]["text"])
        self.assertTrue(report["ok"])
        self.assertEqual(report["checked"], 1)

    def test_graphql_requires_query(self) -> None:
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 41,
                "method": "tools/call",
                "params": {"name": "pulse_graphql", "arguments": {"url": "https://api.test/graphql"}},
            }
        )
        self.assertTrue(result["result"]["isError"])
        self.assertIn("graphqlQuery", result["result"]["content"][0]["text"])

    def test_mutating_send_requires_confirm(self) -> None:
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 42,
                "method": "tools/call",
                "params": {
                    "name": "pulse_send",
                    "arguments": {"method": "POST", "url": "https://example.test/items"},
                },
            }
        )
        self.assertTrue(result["result"]["isError"])
        self.assertIn("confirm=true", result["result"]["content"][0]["text"])

    def test_workspace_list_without_env(self) -> None:
        result = handle_message(
            {
                "jsonrpc": "2.0",
                "id": 43,
                "method": "tools/call",
                "params": {"name": "pulse_workspace_list", "arguments": {}},
            }
        )
        self.assertTrue(result["result"]["isError"])
        self.assertIn("PULSE_WORKSPACE", result["result"]["content"][0]["text"])


if __name__ == "__main__":
    unittest.main()
