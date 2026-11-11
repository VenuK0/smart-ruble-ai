"""Non-networked checks for the Honor one-click demo launcher."""
import io
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from scripts import launch_forum_demo as launcher


class Child:
    def __init__(self, code=None):
        self.code = code

    def poll(self):
        return self.code


class DemoLauncherTests(unittest.TestCase):
    def test_finds_loopback_port_without_exposing_server(self):
        port = launcher.find_local_port()
        self.assertIsInstance(port, int)
        self.assertGreater(port, 0)
        self.assertEqual(launcher.HOST, "127.0.0.1")

    def test_health_verification_rejects_non_simulation(self):
        with patch("scripts.launch_forum_demo.urllib.request.urlopen",
                   return_value=io.BytesIO(b'{"mode":"live"}')), \
             patch("scripts.launch_forum_demo.time.monotonic",
                   side_effect=[0, 31]):
            with self.assertRaisesRegex(RuntimeError, "30 секунд"):
                launcher.wait_for_server("http://127.0.0.1:8000", Child(), timeout=30)

    def test_accepts_local_simulation_health(self):
        with patch("scripts.launch_forum_demo.urllib.request.urlopen",
                   return_value=io.BytesIO(b'{"mode":"simulation"}')) as urlopen:
            launcher.wait_for_server("http://127.0.0.1:8000", Child(), timeout=1)
        self.assertEqual(urlopen.call_args.args[0], "http://127.0.0.1:8000/health")

    def test_crashed_child_fails_immediately(self):
        with self.assertRaisesRegex(RuntimeError, "сервер завершился"):
            launcher.wait_for_server("http://127.0.0.1:8000", Child(1), timeout=1)

    def test_windows_entrypoint_exists(self):
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        cmd = (root / "launch-forum-demo.cmd").read_text(encoding="utf-8")
        self.assertIn(".venv\\Scripts\\python.exe", cmd)
        self.assertIn("scripts\\launch_forum_demo.py", cmd)


if __name__ == "__main__":
    unittest.main()
