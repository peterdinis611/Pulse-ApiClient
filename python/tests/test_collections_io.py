import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulse.bruno import export_bruno, import_bruno, is_bruno_collection
from pulse.envfile import export_dotenv, export_postman_environment, import_postman_environment, parse_dotenv
from pulse.insomnia import export_insomnia, import_insomnia, is_insomnia_export
from pulse.postman import export_postman, import_postman, is_postman_collection

POSTMAN_FIXTURE = json.dumps(
    {
        "info": {
            "name": "Demo Postman",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "auth": {
            "type": "bearer",
            "bearer": [{"key": "token", "value": "col-token", "type": "string"}],
        },
        "variable": [{"key": "base", "value": "https://api.test"}],
        "item": [
            {
                "name": "Nested",
                "item": [
                    {
                        "name": "Get Item",
                        "request": {
                            "method": "GET",
                            "header": [{"key": "Accept", "value": "application/json"}],
                            "url": {
                                "raw": "https://api.test/items/1",
                                "query": [{"key": "q", "value": "x"}],
                            },
                            "auth": {
                                "type": "apikey",
                                "apikey": [
                                    {"key": "key", "value": "X-Api-Key"},
                                    {"key": "value", "value": "secret"},
                                    {"key": "in", "value": "header"},
                                ],
                            },
                        },
                    }
                ],
            },
            {
                "name": "Create",
                "request": {
                    "method": "POST",
                    "url": "https://api.test/items",
                    "body": {"mode": "raw", "raw": '{"ok":true}'},
                },
            },
        ],
    }
)

BRUNO_FIXTURE = json.dumps(
    {
        "name": "Demo Bruno",
        "version": "1",
        "items": [
            {
                "type": "folder",
                "name": "Auth",
                "items": [
                    {
                        "type": "http",
                        "name": "Login",
                        "request": {
                            "url": "https://api.test/login",
                            "method": "POST",
                            "headers": [{"name": "Content-Type", "value": "application/json"}],
                            "params": [],
                            "body": {"mode": "json", "json": '{"user":"a"}'},
                            "auth": {"mode": "basic", "basic": {"username": "u", "password": "p"}},
                        },
                    }
                ],
            }
        ],
    }
)

INSOMNIA_FIXTURE = json.dumps(
    {
        "_type": "export",
        "__export_format": 4,
        "resources": [
            {"_id": "wrk_1", "_type": "workspace", "name": "Demo Insomnia", "parentId": None},
            {"_id": "grp_1", "_type": "request_group", "name": "Items", "parentId": "wrk_1"},
            {
                "_id": "req_1",
                "_type": "request",
                "parentId": "grp_1",
                "name": "List",
                "method": "GET",
                "url": "https://api.test/items",
                "headers": [{"name": "Accept", "value": "application/json"}],
                "parameters": [{"name": "limit", "value": "10"}],
                "authentication": {"type": "bearer", "token": "tok"},
                "body": {"mimeType": "application/json", "text": ""},
            },
        ],
    }
)


class CollectionsIoTests(unittest.TestCase):
    def test_postman_round_trip(self) -> None:
        self.assertTrue(is_postman_collection(POSTMAN_FIXTURE))
        imported = import_postman(POSTMAN_FIXTURE)
        self.assertEqual(imported["version"], 1)
        group = imported["collectionGroups"][0]
        self.assertEqual(group["source"], "postman")
        self.assertIn("Nested", group["folders"])
        self.assertEqual(len(imported["collections"]), 2)
        exported = export_postman(group, imported["collections"])
        again = import_postman(exported)
        self.assertEqual(len(again["collections"]), 2)
        names = sorted(item["name"] for item in again["collections"])
        self.assertEqual(names, ["Create", "Get Item"])

    def test_bruno_round_trip(self) -> None:
        self.assertTrue(is_bruno_collection(BRUNO_FIXTURE))
        imported = import_bruno(BRUNO_FIXTURE)
        group = imported["collectionGroups"][0]
        self.assertEqual(group["source"], "bruno")
        self.assertEqual(imported["collections"][0]["folder"], "Auth")
        exported = export_bruno(group, imported["collections"])
        again = import_bruno(exported)
        self.assertEqual(again["collections"][0]["request"]["auth"]["authType"], "basic")

    def test_insomnia_round_trip(self) -> None:
        self.assertTrue(is_insomnia_export(INSOMNIA_FIXTURE))
        imported = import_insomnia(INSOMNIA_FIXTURE)
        group = imported["collectionGroups"][0]
        self.assertEqual(group["source"], "insomnia")
        self.assertEqual(imported["collections"][0]["folder"], "Items")
        exported = export_insomnia(group, imported["collections"])
        again = import_insomnia(exported)
        self.assertEqual(again["collections"][0]["request"]["auth"]["authType"], "bearer")

    def test_envfile_helpers(self) -> None:
        dotenv = export_dotenv([{"key": "BASE", "value": "https://x.test", "enabled": True}], name="Local")
        self.assertIn("BASE=https://x.test", dotenv)
        self.assertEqual(parse_dotenv(dotenv)["BASE"], "https://x.test")
        postman = export_postman_environment("Staging", {"TOKEN": "abc"})
        env = import_postman_environment(postman)
        self.assertEqual(env["name"], "Staging")
        self.assertEqual(env["values"][0]["key"], "TOKEN")


if __name__ == "__main__":
    unittest.main()
