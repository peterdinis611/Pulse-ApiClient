"""Offline tests for SSE / GraphQL / GraphQL-WS helpers (stdlib fallbacks)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.curl import curl_to_payload, payload_to_curl
from pulse.graphql import (
    INTROSPECTION_QUERY,
    build_body,
    format_response,
    list_operations,
    summarize_schema,
    validate,
)
from pulse.graphql_ws import complete, ping, pong, start, stop, subscribe
from pulse.sse import parse_block, parse_text


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
                "bodyKind": "json",
                "body": '{"ok":true}',
            }
        )
        self.assertIn("curl", command)
        self.assertIn("-X POST", command)
        self.assertIn("https://example.com", command)


if __name__ == "__main__":
    unittest.main()
