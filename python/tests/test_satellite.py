import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.bench import compare_bench, run_bench
from pulse.envfile import load_data_rows, load_env, parse_dotenv
from pulse.export import is_run_input, to_run_input
from pulse.har import har_to_pulse
from pulse.junit import to_junit
from pulse.openapi import convert
from pulse.report import percentile, summarize_run
from pulse.schema import validate_json


class EnvTests(unittest.TestCase):
    def test_dotenv_and_overlays(self) -> None:
        parsed = parse_dotenv('BASE=https://api.test\nexport TOKEN="abc"\n# skip\n')
        self.assertEqual(parsed["BASE"], "https://api.test")
        self.assertEqual(parsed["TOKEN"], "abc")
        merged = load_env({"id": "1"}, pairs=["id=2", "extra=z"])
        self.assertEqual(merged["id"], "2")
        self.assertEqual(merged["extra"], "z")

    def test_csv_rows(self) -> None:
        path = Path(__file__).with_name("_rows.csv")
        path.write_text("id,name\n1,ada\n2,grace\n")
        self.addCleanup(path.unlink)
        rows = load_data_rows(path)
        self.assertEqual(rows, [{"id": "1", "name": "ada"}, {"id": "2", "name": "grace"}])


class ExportTests(unittest.TestCase):
    def test_workspace_export(self) -> None:
        payload = {
            "version": 1,
            "collectionGroups": [{"id": "col_1", "name": "Pets", "folders": []}],
            "collections": [
                {
                    "id": "saved_1",
                    "name": "List",
                    "collectionId": "col_1",
                    "request": {"method": "GET", "url": "https://api.test/pets"},
                }
            ],
        }
        run = to_run_input(payload, env={"token": "x"})
        self.assertTrue(is_run_input(run))
        self.assertEqual(run["collectionName"], "Pets")
        self.assertEqual(run["requests"][0]["request"]["url"], "https://api.test/pets")
        self.assertEqual(run["environment"]["variables"][0]["value"], "x")

    def test_pulse_schema_export(self) -> None:
        payload = {
            "info": {"name": "Auth", "schema": "https://schema.pulse.dev/collection/v1.json"},
            "folders": ["login"],
            "item": [
                {
                    "name": "login",
                    "item": [{"name": "Token", "request": {"method": "POST", "url": "{{base}}/token"}}],
                }
            ],
        }
        run = to_run_input(payload)
        self.assertEqual(run["requests"][0]["folder"], "login")
        self.assertEqual(run["requests"][0]["request"]["method"], "POST")


class OpenApiTests(unittest.TestCase):
    def test_params_body_and_status_test(self) -> None:
        spec = {
            "info": {"title": "Pets"},
            "servers": [{"url": "https://api.test"}],
            "paths": {
                "/pets/{petId}": {
                    "parameters": [{"in": "path", "name": "petId", "example": "9"}],
                    "get": {
                        "tags": ["pets"],
                        "summary": "Get pet",
                        "parameters": [{"in": "query", "name": "verbose", "schema": {"type": "boolean"}}],
                        "responses": {"200": {"description": "ok"}},
                    },
                    "post": {
                        "summary": "Create pet",
                        "requestBody": {
                            "content": {"application/json": {"example": {"name": "Ada"}}},
                        },
                        "responses": {"201": {"description": "created"}},
                    },
                }
            },
        }
        collection = convert(spec)
        get_req = next(item["request"] for item in collection["collections"] if item["request"]["method"] == "GET")
        post_req = next(item["request"] for item in collection["collections"] if item["request"]["method"] == "POST")
        self.assertEqual(get_req["pathParams"][0]["value"], "9")
        self.assertEqual(get_req["query"][0]["key"], "verbose")
        self.assertIn("status(200)", get_req["tests"])
        self.assertEqual(post_req["bodyKind"], "json")
        self.assertIn("Ada", post_req["body"])
        self.assertIn("status(201)", post_req["tests"])
        self.assertEqual(collection["collectionGroups"][0]["folders"], ["pets"])


class HarTests(unittest.TestCase):
    def test_skips_non_http_and_maps_json(self) -> None:
        har = {
            "log": {
                "creator": {"name": "Chrome"},
                "entries": [
                    {"request": {"method": "GET", "url": "ws://localhost/socket"}},
                    {
                        "request": {
                            "method": "POST",
                            "url": "https://api.test/pets?limit=2",
                            "headers": [{"name": "Content-Type", "value": "application/json"}],
                            "queryString": [{"name": "limit", "value": "2"}],
                            "postData": {"mimeType": "application/json", "text": '{"n":1}'},
                        }
                    },
                ],
            }
        }
        pulse = har_to_pulse(har)
        self.assertEqual(len(pulse["collections"]), 1)
        request = pulse["collections"][0]["request"]
        self.assertEqual(request["method"], "POST")
        self.assertEqual(request["bodyKind"], "json")
        self.assertEqual(request["query"][0]["value"], "2")


class ReportTests(unittest.TestCase):
    def test_percentiles_and_junit(self) -> None:
        self.assertEqual(percentile([10, 20, 30, 40], 50), 25)
        result = {
            "collectionName": "Pets",
            "passed": 1,
            "failed": 1,
            "steps": [
                {
                    "saved": {"name": "ok"},
                    "response": {"elapsedMs": 12, "totalMs": 12},
                    "testResults": {"failed": 0, "results": []},
                },
                {
                    "saved": {"name": "bad"},
                    "error": "timeout",
                    "response": None,
                    "testResults": {"failed": 1, "results": [{"name": "status", "passed": False, "error": "timeout"}]},
                },
            ],
        }
        summary = summarize_run(result)
        self.assertEqual(summary["timing"]["p50Ms"], 12)
        self.assertEqual(summary["httpErrors"], 1)
        xml = to_junit(result)
        self.assertIn('failures="1"', xml)
        self.assertIn("timeout", xml)


class SchemaTests(unittest.TestCase):
    def test_required_and_types(self) -> None:
        schema = {
            "type": "object",
            "required": ["id"],
            "properties": {"id": {"type": "integer"}, "tags": {"type": "array", "items": {"type": "string"}}},
        }
        self.assertEqual(validate_json({"id": 1, "tags": ["a"]}, schema), [])
        errors = validate_json({"tags": [1]}, schema)
        self.assertTrue(any("id" in item for item in errors))
        self.assertTrue(any("string" in item for item in errors))


class BenchTests(unittest.TestCase):
    def test_budget(self) -> None:
        calls = {"n": 0}

        def once() -> dict:
            calls["n"] += 1
            return {
                "passed": 1,
                "failed": 0,
                "steps": [{"saved": {"name": "ping"}, "response": {"elapsedMs": 40, "totalMs": 40}}],
            }

        report = run_bench(once, 3)
        self.assertEqual(calls["n"], 3)
        self.assertEqual(report["timing"]["p95Ms"], 40)
        self.assertTrue(compare_bench(report, {}, p95_budget=10))
        self.assertFalse(compare_bench(report, {"timing": {"p95Ms": 50}}, factor=1.2))


if __name__ == "__main__":
    unittest.main()
