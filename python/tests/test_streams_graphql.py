"""Offline tests for SSE / GraphQL / GraphQL-WS helpers (stdlib fallbacks)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.bench import compare_bench, format_bench_summary, run_bench
from pulse.curl import curl_to_payload, payload_to_curl
from pulse.diff import compare
from pulse.graphql import (
    INTROSPECTION_QUERY,
    build_body,
    example_queries,
    format_response,
    list_operations,
    response_error_count,
    summarize_schema,
    validate,
)
from pulse.graphql_ws import complete, ping, pong, start, stop, subscribe
from pulse.sse import filter_events, parse_block, parse_text, summarize


class SseOfflineTests(unittest.TestCase):
    def test_id_retry_and_comments(self) -> None:
        event = parse_block("id: 7\nretry: 1200\n: keepalive\ndata: tick")
        assert event is not None
        self.assertEqual(event["id"], "7")
        self.assertEqual(event["retryMs"], 1200)
        self.assertEqual(event["data"], "tick")

    def test_bom_and_crlf_document(self) -> None:
        events = parse_text("\ufeffdata: one\r\n\r\ndata: two\r\n\r\n")
        self.assertEqual([item["data"] for item in events], ["one", "two"])

    def test_null_byte_in_id_is_ignored(self) -> None:
        event = parse_block("id: a\0b\ndata: x")
        assert event is not None
        self.assertNotIn("id", event)
        self.assertEqual(event["data"], "x")

    def test_filter_and_summarize(self) -> None:
        events = parse_text("event: ping\ndata: a\n\nevent: pong\ndata: b\n\nid: 9\ndata: c\n\n")
        only_ping = filter_events(events, "ping")
        self.assertEqual(len(only_ping), 1)
        self.assertEqual(only_ping[0]["data"], "a")
        summary = summarize(events)
        self.assertEqual(summary["count"], 3)
        self.assertEqual(summary["byEvent"]["ping"], 1)
        self.assertEqual(summary["latestId"], "9")


class GraphqlOfflineTests(unittest.TestCase):
    def test_build_validate_and_format(self) -> None:
        body = json.loads(build_body("query Q { ping }", "{}", "Q"))
        self.assertEqual(body["operationName"], "Q")
        self.assertIsNone(validate("query { ping }", {"ok": True}))
        self.assertEqual(validate("", "{}"), "GraphQL query is required.")
        self.assertIn("JSON object", validate("query { ping }", '"bad"') or "")
        formatted = format_response(
            json.dumps(
                {
                    "data": {"ping": True},
                    "errors": [{"message": "Nope", "path": ["ping"]}],
                }
            )
        )
        self.assertIn("Nope", formatted)
        self.assertIn("path: ping", formatted)

    def test_summarize_and_list_operations(self) -> None:
        self.assertIn("__schema", INTROSPECTION_QUERY)
        self.assertIn("subscriptionType", INTROSPECTION_QUERY)
        summary = summarize_schema(
            {
                "data": {
                    "__schema": {
                        "queryType": {"name": "Query"},
                        "subscriptionType": {"name": "Subscription"},
                        "types": [
                            {
                                "kind": "OBJECT",
                                "name": "Query",
                                "fields": [{"name": "ping"}],
                            },
                            {
                                "kind": "OBJECT",
                                "name": "__Schema",
                                "fields": [{"name": "types"}],
                            },
                        ],
                    }
                }
            }
        )
        assert summary is not None
        self.assertEqual(summary["subscriptionType"], "Subscription")
        self.assertEqual(summary["types"][0]["fields"], ["ping"])
        ops = list_operations("query A { a } mutation B { b }")
        self.assertEqual([item["kind"] for item in ops], ["query", "mutation"])
        self.assertEqual(ops[0]["name"], "A")
        ignored = list_operations("# query Skip { x }\nquery Keep { y }")
        self.assertEqual([item["name"] for item in ignored], ["Keep"])
        examples = example_queries(summary, limit=1)
        self.assertTrue(any("ping" in item for item in examples))
        self.assertEqual(response_error_count('{"errors":[{"message":"x"}]}'), 1)


class DiffBenchOfflineTests(unittest.TestCase):
    def test_path_diff_and_bench_summary(self) -> None:
        report = compare({"id": 1, "nested": {"a": 1}}, {"id": 2, "nested": {"a": 1}})
        self.assertFalse(report["equal"])
        self.assertGreaterEqual(report["pathsChanged"], 1)
        self.assertTrue(any(item["path"] == "$.id" for item in report["paths"]))
        same = compare({"b": 1, "a": 2}, {"a": 2, "b": 1})
        self.assertTrue(same["equal"])

        def once() -> dict:
            return {
                "passed": 1,
                "failed": 0,
                "steps": [{"saved": {"name": "ping"}, "response": {"elapsedMs": 12, "totalMs": 12}}],
            }

        bench = run_bench(once, 2)
        self.assertEqual(bench["failedRuns"], 0)
        self.assertTrue(bench["ok"])
        self.assertIn("meanMs", bench["timing"])
        self.assertIn("stddevMs", bench["timing"])
        self.assertIn("successRate", format_bench_summary(bench))
        self.assertTrue(compare_bench(bench, {}, p95_budget=1))  # errors list is truthy
        self.assertFalse(compare_bench(bench, {"timing": {"p95Ms": 100}}, factor=1.2))


class GraphqlWsOfflineTests(unittest.TestCase):
    def test_legacy_and_ping_frames(self) -> None:
        started = json.loads(start("2", "subscription { x }", {"n": 1}, "X"))
        self.assertEqual(started["type"], "start")
        self.assertEqual(started["payload"]["operationName"], "X")
        self.assertEqual(json.loads(stop("2")), {"type": "stop", "id": "2"})
        self.assertEqual(json.loads(ping({"t": 1}))["type"], "ping")
        self.assertEqual(json.loads(pong())["type"], "pong")
        self.assertEqual(json.loads(subscribe("1", "subscription { y }"))["type"], "subscribe")
        self.assertEqual(json.loads(complete("1"))["id"], "1")


class CurlOfflineTests(unittest.TestCase):
    def test_json_head_get_and_multipart(self) -> None:
        json_payload = curl_to_payload("curl --json '{\"a\":1}' https://api.example.com/x")
        self.assertEqual(json_payload["method"], "POST")
        self.assertEqual(json_payload["bodyKind"], "json")
        head = curl_to_payload("curl -I https://api.example.com")
        self.assertEqual(head["method"], "HEAD")
        get = curl_to_payload("curl -G -d 'q=pulse' https://api.example.com/search")
        self.assertEqual(get["method"], "GET")
        self.assertEqual(get["query"][0]["key"], "q")
        multi = curl_to_payload(
            "curl -F 'file=@photo.png;type=image/png' -F 'note=hi' https://api.example.com/up"
        )
        self.assertEqual(multi["bodyKind"], "multipart")
        self.assertEqual(multi["multipart"][0]["fieldType"], "file")

    def test_payload_to_curl_fallback(self) -> None:
        command = payload_to_curl(
            {
                "method": "POST",
                "url": "https://example.com",
                "headers": [{"key": "Accept", "value": "application/json", "enabled": True}],
                "query": [{"key": "q", "value": "1", "enabled": True}],
                "bodyKind": "json",
                "body": '{"ok":true}',
                "auth": {"authType": "bearer", "bearerToken": "tok"},
            }
        )
        self.assertIn("curl", command)
        self.assertIn("-X POST", command)
        self.assertIn("https://example.com", command)
        self.assertIn("Authorization: Bearer tok", command)
        self.assertIn("q=1", command)
        self.assertIn("--compressed", command)

    def test_url_query_split_and_location_flag(self) -> None:
        payload = curl_to_payload("curl -L 'https://api.example.com/items?x=1&y=2'")
        self.assertEqual(payload["url"], "https://api.example.com/items")
        keys = {row["key"] for row in payload["query"]}
        self.assertEqual(keys, {"x", "y"})


if __name__ == "__main__":
    unittest.main()
