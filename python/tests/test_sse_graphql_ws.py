import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.contract import breaking_diff, compare_to_schema
from pulse.graphql_ws import complete, connection_init, parse_frame, subscribe
from pulse.sse import parse_block, parse_text


class SseGraphqlWsTests(unittest.TestCase):
    def test_parse_sse_block(self) -> None:
        event = parse_block("event: ping\ndata: hello\ndata: world")
        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event["data"], "hello\nworld")
        self.assertEqual(event.get("event"), "ping")

    def test_parse_sse_text(self) -> None:
        events = parse_text("data: one\n\ndata: two\n\n")
        self.assertEqual([item["data"] for item in events], ["one", "two"])

    def test_graphql_ws_frames(self) -> None:
        init = json.loads(connection_init(auth={"authType": "bearer", "bearerToken": "tok"}))
        self.assertEqual(init["type"], "connection_init")
        self.assertEqual(init["payload"]["Authorization"], "Bearer tok")
        sub = json.loads(subscribe("1", "subscription { ping }", {"a": 1}, "Ping"))
        self.assertEqual(sub["type"], "subscribe")
        self.assertEqual(sub["id"], "1")
        self.assertEqual(json.loads(complete("1")), {"type": "complete", "id": "1"})
        self.assertEqual(parse_frame('{"type":"connection_ack"}')["type"], "connection_ack")

    def test_contract_helpers(self) -> None:
        ok = compare_to_schema({"id": 1}, {"type": "object", "required": ["id"], "properties": {"id": {"type": "integer"}}})
        self.assertTrue(ok["ok"])
        broken = breaking_diff({"id": 1, "name": "a"}, {"id": 1})
        self.assertFalse(broken["ok"])
        self.assertTrue(any("name" in item for item in broken["errors"]))


if __name__ == "__main__":
    unittest.main()
