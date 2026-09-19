"""Regression checks for destructive R2 retention boundaries; no network access."""

import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("prune", Path(__file__).with_name("prune-probe-releases.py"))
prune = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prune)


def release(version):
    return [{"key": f"apps/bat/{version}/{name}", "size": 10, "etag": name} for name in prune.FILES]


class RetentionTests(unittest.TestCase):
    def test_numeric_order_scope_and_idempotence(self):
        objects = sum((release(v) for v in ["2.9.0", "2.10.0", "2.11.0", "3.0.0", "latest"]), [])
        objects += [{"key": key, "size": 1} for key in [
            "apps/other/1.0.0/file", "apps/bat/install.sh", "apps/bat/preview/file",
            "apps/bat/3.1.0-beta/file", "apps/bat/01.0.0/file",
        ]]
        plan = prune.cleanup_plan(objects, "3.0.0")
        self.assertEqual(plan["keep"], ["3.0.0", "2.11.0", "2.10.0"])
        self.assertEqual(set(plan["delete"]), {obj["key"] for obj in release("2.9.0")})
        self.assertEqual(plan["delete_bytes"], 40)
        remaining = [obj for obj in objects if obj["key"] not in plan["delete"]]
        self.assertEqual(prune.cleanup_plan(remaining, "3.0.0")["delete"], [])

    def test_incomplete_release_or_latest_prevents_deletion(self):
        objects = release("3.0.0") + release("latest")
        self.assertEqual(prune.cleanup_plan(objects, "3.0.0")["delete"], [])
        for index in range(len(objects)):
            with self.subTest(index=index), self.assertRaises(ValueError):
                prune.cleanup_plan(objects[:index] + objects[index + 1:], "3.0.0")
        objects[-1]["etag"] = "previous-release"
        with self.assertRaises(ValueError):
            prune.cleanup_plan(objects, "3.0.0")
        with self.assertRaises(ValueError):
            prune.cleanup_plan(release("3.0.0") + release("latest"), "2.9.0")

    def test_pagination_and_incomplete_listing(self):
        def response(objects, info=None):
            return io.BytesIO(json.dumps({"success": True, "result": objects, "result_info": info or {}}).encode())
        with patch.object(prune.urllib.request, "urlopen", side_effect=[
            response([{"key": "a"}], {"is_truncated": True, "cursor": "next"}),
            response([{"key": "b"}]),
        ]) as fetch:
            self.assertEqual(prune.list_objects("test"), [{"key": "a"}, {"key": "b"}])
            self.assertIn("cursor=next", fetch.call_args.args[0].full_url)
        for info in [{"is_truncated": True}, {"is_truncated": True, "cursor": "same"}]:
            with patch.object(prune.urllib.request, "urlopen", side_effect=lambda *a, **k: response([], info)):
                with self.assertRaises(ValueError):
                    prune.list_objects("test")
        with patch.object(prune.urllib.request, "urlopen", return_value=io.BytesIO(b'{"success":false}')):
            with self.assertRaises(ValueError):
                prune.list_objects("test")


if __name__ == "__main__":
    unittest.main()
