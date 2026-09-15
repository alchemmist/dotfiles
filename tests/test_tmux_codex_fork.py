import importlib.util
import pathlib
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "fork", pathlib.Path(__file__).resolve().parents[1] / "scripts/tmux-codex-fork.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Tests(unittest.TestCase):
    def test_exact_pane_and_missing_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmux = ["tmux", "-S", tmp + "/socket"]

            def tm(*args):
                return subprocess.check_output([*tmux, *args], text=True).strip()

            try:
                tm(
                    "-f",
                    "/dev/null",
                    "new-session",
                    "-d",
                    "-s",
                    "arcadia",
                    "-n",
                    "pilot",
                    "sleep 90",
                )
                pilot = tm("display-message", "-p", "-t", "arcadia:pilot", "#{pane_id}")
                tm("new-window", "-d", "-t", "arcadia", "-n", "cpu", "sleep 90")
                cpu = tm("display-message", "-p", "-t", "arcadia:cpu", "#{pane_id}")
                tm(
                    "set-option",
                    "-p",
                    "-t",
                    pilot,
                    "@codex_thread_id",
                    "11111111-1111-4111-8111-111111111111",
                )
                tm(
                    "set-option",
                    "-p",
                    "-t",
                    cpu,
                    "@codex_thread_id",
                    "22222222-2222-4222-8222-222222222222",
                )
                wrapper = pathlib.Path(tmp) / "tmux-codex"
                wrapper.write_text(
                    '#!/bin/sh\nif [ "$3" = "display-message" ]; then\n tmux "$@" | sed "s/^sleep$/codex/"\nelse\n exec tmux "$@"\nfi\n'
                )
                wrapper.chmod(0o700)
                wrapped = [str(wrapper), "-S", tmp + "/socket"]
                plan = module.fork_plan(wrapped, cpu, "/tmp/codex test")
                self.assertEqual(
                    plan[-1],
                    "'/tmp/codex test' fork 22222222-2222-4222-8222-222222222222",
                )
                self.assertEqual(
                    plan[plan.index("-t") + 1],
                    tm("display-message", "-p", "-t", cpu, "#{session_id}") + ":",
                )
                before = tm("list-windows", "-t", "arcadia", "-F", "#{window_id}")
                tm("set-option", "-pu", "-t", cpu, "@codex_thread_id")
                tm(
                    "set-option",
                    "-t",
                    "arcadia",
                    "@codex_thread_id",
                    "11111111-1111-4111-8111-111111111111",
                )
                with self.assertRaisesRegex(ValueError, "refusing to guess"):
                    module.fork_plan(wrapped, cpu, "codex")
                self.assertEqual(
                    tm("list-windows", "-t", "arcadia", "-F", "#{window_id}"), before
                )
            finally:
                subprocess.run(
                    [*tmux, "kill-server"],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )


if __name__ == "__main__":
    unittest.main()
