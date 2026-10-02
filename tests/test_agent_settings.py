import json
import stat
import shutil
import tomllib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/sync-agent-settings.py"


class AgentSettingsTest(unittest.TestCase):
    def test_capture_and_render_preserve_private_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            repo = base / "repo"
            home = base / "home"
            repo.mkdir()
            expected = {}
            for agent in ("antex", "codex", "claude"):
                source = home / ("." + agent) / "settings.json"
                source.parent.mkdir(parents=True)
                settings = {
                    "theme": "dark",
                    "hooks": {"Stop": []},
                    "env": {"ANTHROPIC_AUTH_TOKEN": "private-test-value", "DISABLE_TELEMETRY": "1"},
                }
                source.write_text(json.dumps(settings))
                expected[agent] = settings
            for mode in ("capture", "render"):
                result = subprocess.run(
                    [sys.executable, str(SCRIPT), mode, "--root", str(repo), "--home", str(home)],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                self.assertNotIn("private-test-value", result.stdout + result.stderr)
            for agent, settings in expected.items():
                public = repo / agent / "settings.public.json"
                runtime = repo / ".private/agent-settings" / agent / "settings.json"
                self.assertNotIn("private-test-value", public.read_text())
                self.assertNotIn("ANTHROPIC_AUTH_TOKEN", public.read_text())
                self.assertEqual(json.loads(runtime.read_text()), settings)
                self.assertEqual(stat.S_IMODE(runtime.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((repo / ".private").stat().st_mode), 0o700)

    @unittest.skipUnless(shutil.which("dotter"), "Dotter is not installed")
    def test_hook_directory_survives_redeployment(self):
        config = tomllib.loads((ROOT / ".dotter/global.toml").read_text())
        mapping = config["default"]["files"]["antex/hooks"]
        self.assertFalse(mapping["recurse"])
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            source = base / "source"
            source.mkdir()
            guard = source / "guard.py"
            guard.write_text("pass\n")
            target = base / "hooks"
            target.symlink_to(source, target_is_directory=True)
            global_config = base / "global.toml"
            global_config.write_text(
                "[check.files]\n" + json.dumps(str(source))
                + " = { target = " + json.dumps(str(target))
                + ', type = "symbolic", recurse = false }\n'
            )
            local_config = base / "local.toml"
            local_config.write_text('packages = ["check"]\n')
            command = [
                "dotter", "--global-config", str(global_config),
                "--local-config", str(local_config),
                "--cache-file", str(base / "cache.toml"),
                "--cache-directory", str(base / "cache"),
                "--pre-deploy", str(base / "no-pre"),
                "--post-deploy", str(base / "no-post"), "deploy",
            ]
            for existing in (True, False):
                if not existing:
                    target.unlink()
                subprocess.run(command, capture_output=True, text=True, check=True)
                self.assertTrue(target.is_symlink())
                self.assertFalse(guard.is_symlink())
                self.assertEqual(guard.read_text(), "pass\n")

    def test_render_rejects_secret_in_public_config(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            public = repo / "claude/settings.public.json"
            public.parent.mkdir()
            public.write_text(json.dumps({"env": {"ANTHROPIC_AUTH_TOKEN": "private-test-value"}}))
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "render", "--root", str(repo)],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("private-test-value", result.stdout + result.stderr)
            self.assertFalse((repo / ".private/agent-settings/claude/settings.json").exists())


if __name__ == "__main__":
    unittest.main()
