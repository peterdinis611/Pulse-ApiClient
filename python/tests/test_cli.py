import io
import json
import os
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pulse_cli


ROOT = Path(__file__).resolve().parents[1]
GIT_WS = ROOT / "examples" / "git-workspace"


class CliHelpTests(unittest.TestCase):
    def test_help_lists_workspace(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["help"])
        self.assertEqual(code, 0)
        text = buf.getvalue()
        self.assertIn("workspace status", text)
        self.assertIn("mock start", text)
        self.assertIn("pre-request", text)

    def test_env_merge_dotenv(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(
                ["env", "--env-file", str(ROOT / "examples" / "staging.env"), "--format", "dotenv"]
            )
        self.assertEqual(code, 0)
        self.assertIn("baseUrl=", buf.getvalue())

    def test_openapi_list(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["openapi", str(ROOT / "examples" / "openapi.json"), "--list"])
        self.assertEqual(code, 0)
        rows = json.loads(buf.getvalue())
        self.assertTrue(isinstance(rows, list) and rows)
        self.assertIn("method", rows[0])
        self.assertIn("path", rows[0])

    def test_curl_and_snippet(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["curl", "curl -X GET https://api.example.com/health"])
        self.assertEqual(code, 0)
        payload = json.loads(buf.getvalue())
        self.assertEqual(payload["method"], "GET")

        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(
                ["snippet", "--url", "https://api.example.com/health", "--format", "python"]
            )
        self.assertEqual(code, 0)
        self.assertIn("requests", buf.getvalue())

    def test_workspace_status_list_search(self) -> None:
        if not GIT_WS.is_dir():
            self.skipTest("git-workspace fixture missing")
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["workspace", "--workspace", str(GIT_WS), "status"])
        self.assertEqual(code, 0)
        status = json.loads(buf.getvalue())
        self.assertIn("requests", status)

        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["workspace", "--workspace", str(GIT_WS), "list"])
        self.assertEqual(code, 0)
        rows = json.loads(buf.getvalue())
        self.assertTrue(rows)
        self.assertTrue(rows[0].get("id"))

        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["workspace", "--workspace", str(GIT_WS), "search", "pets"])
        self.assertEqual(code, 0)
        self.assertTrue(json.loads(buf.getvalue()))

    def test_workspace_delete_requires_confirm(self) -> None:
        if not GIT_WS.is_dir():
            self.skipTest("git-workspace fixture missing")
        with self.assertRaises(SystemExit) as raised:
            pulse_cli.main(["workspace", "--workspace", str(GIT_WS), "delete", "missing-id"])
        self.assertIn("confirm", str(raised.exception).lower())

    def test_contract_on_fixture(self) -> None:
        if not GIT_WS.is_dir():
            self.skipTest("git-workspace fixture missing")
        with mock.patch.object(pulse_cli, "load_native", side_effect=SystemExit("skip native")):
            buf = io.StringIO()
            with redirect_stdout(buf):
                code = pulse_cli.main(["contract", str(GIT_WS)])
            self.assertEqual(code, 0)
            self.assertEqual(buf.getvalue().strip(), "ok")

    def test_workspace_from_env(self) -> None:
        if not GIT_WS.is_dir():
            self.skipTest("git-workspace fixture missing")
        previous = os.environ.get("PULSE_WORKSPACE")
        os.environ["PULSE_WORKSPACE"] = str(GIT_WS)
        self.addCleanup(lambda: _restore_env("PULSE_WORKSPACE", previous))
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pulse_cli.main(["workspace", "envs"])
        self.assertEqual(code, 0)
        self.assertIsInstance(json.loads(buf.getvalue()), list)


def _restore_env(key: str, previous: str | None) -> None:
    if previous is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = previous


if __name__ == "__main__":
    unittest.main()
