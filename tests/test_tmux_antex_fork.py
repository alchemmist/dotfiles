import contextlib
import importlib.util
import io
import json
import pathlib
import shlex
import types
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "antex_fork", pathlib.Path(__file__).resolve().parents[1] / "scripts/tmux-antex-fork.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
THREAD = "11111111-1111-4111-8111-111111111111"


class Tests(unittest.TestCase):
    def setUp(self):
        self.metadata = mock.patch.object(
            module.subprocess, "check_output",
            return_value="$0\n%7\n/project with spaces\nantex\n",
        )
        self.binding = mock.patch.object(
            module.subprocess, "run",
            return_value=types.SimpleNamespace(
                returncode=0, stdout=json.dumps({"thread_id": THREAD})
            ),
        )
        self.metadata.start()
        self.run = self.binding.start()
        self.addCleanup(self.metadata.stop)
        self.addCleanup(self.binding.stop)

    def test_fork_keeps_exact_thread_and_uses_embedded_engine(self):
        plan = module.fork_plan(["tmux", "-S", "/socket"], "%7", "/bin/antex with spaces")
        self.assertEqual(plan, [
            "tmux", "-S", "/socket", "new-window", "-t", "$0:",
            "-n", "fork-11111111", "-c", "/project with spaces",
            shlex.join(["/bin/antex with spaces", "fork", THREAD, "--no-daemon"]),
        ])

    def test_default_binary_does_not_depend_on_tmux_path_or_shell_aliases(self):
        output = io.StringIO()
        with mock.patch.object(module.sys, "argv", [
            "tmux-antex-fork.py", "--pane", "%7", "--socket", "/socket", "--dry-run",
        ]), contextlib.redirect_stdout(output):
            self.assertEqual(module.main(), 0)
        plan = json.loads(output.getvalue())
        self.assertEqual(shlex.split(plan[-1]), [
            str(pathlib.Path.home() / ".local/bin/antex"), "fork", THREAD, "--no-daemon",
        ])
        self.assertEqual(self.run.call_count, 1)  # Metadata read, no new-window execution.


if __name__ == "__main__":
    unittest.main()
