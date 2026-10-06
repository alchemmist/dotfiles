import importlib.util
import plistlib
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('deploy_macos', ROOT / 'scripts/deploy-macos.py')
MACOS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MACOS)


class MacosDeployTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('dotter'), 'Dotter is required for the first-deploy integration test')
    def test_dotter_first_deploy_generates_private_settings_before_rendering(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = '.dotter/templates/antex-settings.json.hbs'
            (root / source).parent.mkdir(parents=True)
            shutil.copy2(ROOT / source, root / source)
            (root / 'global.toml').write_text(
                '[test.files]\n"' + source + '" = {target="' + str(root / 'settings.json') + '", type="template"}\n'
            )
            (root / 'local.toml').write_text('packages=["test"]\n')
            (root / 'generate.py').write_text(
                'from pathlib import Path\n'
                'path = Path(".private/agent-settings/antex/settings.json")\n'
                'path.parent.mkdir(parents=True)\n'
                'path.write_text(\'{"literal":"{{not-a-template}}"}\\n\')\n'
            )
            (root / 'pre.sh').write_text('#!/bin/sh\nset -eu\npython3 generate.py\n')
            (root / 'pre.sh').chmod(0o700)
            self.assertFalse((root / '.private').exists())
            result = subprocess.run([
                shutil.which('dotter'), '--global-config', 'global.toml', '--local-config', 'local.toml',
                '--cache-file', str(root / 'cache.toml'), '--cache-directory', str(root / 'cache'),
                '--pre-deploy', 'pre.sh', '--post-deploy', str(root / 'absent-hook'), 'deploy',
            ], cwd=root, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / 'settings.json').read_text().strip(), '{"literal":"{{not-a-template}}"}')

    def test_render_uses_destination_home_and_preserves_public_templates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for source, _ in MACOS.LAUNCH_AGENTS:
                destination = root / source
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / source, destination)
            home = root / 'different user'
            MACOS.render(root, home)
            outputs = root / '.private/macos/launchagents'
            arc = plistlib.loads((outputs / 'org.alchemmist.arcadia-mount.plist').read_bytes())
            self.assertEqual(arc['WorkingDirectory'], str(home))
            self.assertEqual(arc['ProgramArguments'][-1], str(home / 'scripts/mount-arcadia-at-login.zsh'))
            self.assertEqual(arc['KeepAlive'], {'SuccessfulExit': False})
            self.assertEqual((root / MACOS.LAUNCH_AGENTS[0][0]).read_bytes(), (ROOT / MACOS.LAUNCH_AGENTS[0][0]).read_bytes())
            before = {p.name: p.stat().st_mtime_ns for p in outputs.iterdir()}
            MACOS.render(root, home)
            self.assertEqual(before, {p.name: p.stat().st_mtime_ns for p in outputs.iterdir()})

    def test_desktop_setup_does_not_restart_existing_mount_or_services(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            agents = home / 'Library/LaunchAgents'
            agents.mkdir(parents=True)
            for _, label in MACOS.LAUNCH_AGENTS:
                (agents / (label + '.plist')).write_text('existing launch agent')
            calls = []

            def run(command, **kwargs):
                calls.append(command)
                return subprocess.CompletedProcess(command, 0)

            with patch.object(MACOS, 'HOME_DIR', home), patch.object(MACOS.subprocess, 'run', side_effect=run):
                MACOS.configure_desktop()
            self.assertTrue(any(command[:3] == ['/usr/bin/defaults', 'write', 'com.apple.finder'] for command in calls))
            self.assertFalse(any('bootstrap' in command or 'bootout' in command or 'kill' in command for command in calls))
            self.assertEqual((home / '.local/state/arcadia-mount/stderr.log').stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
