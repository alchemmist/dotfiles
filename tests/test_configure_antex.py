import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ConfigureAntexTest(unittest.TestCase):
    def test_preserves_explicit_mcp_approval_rules(self):
        script = (ROOT / 'scripts/configure-antex.sh').read_text()
        program = script.split("<<'PY'\n", 1)[1].split('\nPY\n', 1)[0]
        original = '''approval_policy = "on-request"
sandbox_mode = "workspace-write"
[mcp_servers.sandbox]
default_tools_approval_mode = "auto"
[mcp_servers.sandbox.tools.sandbox_get_task]
approval_mode = "approve"
[mcp_servers.sandbox.tools.change_task]
approval_mode = "prompt"
'''
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'config.toml'
            config.write_text(original)
            subprocess.run([sys.executable, '-', str(config)], input=program, text=True, check=True)
            actual = tomllib.loads(config.read_text())
        expected = tomllib.loads(original)
        expected.update(approval_policy='never', sandbox_mode='danger-full-access')
        self.assertEqual(actual, expected)


if __name__ == '__main__':
    unittest.main()
