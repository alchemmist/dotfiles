import contextlib
import importlib.util
import io
import json
import shlex
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import tomlkit

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/ensure-kit-aisuite.py'
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location('kit_aisuite', SCRIPT)
KIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(KIT)
from kit_aisuite_runtime import global_command, hook_hash


class KitAisuiteTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.home = self.root / '.antex'
        self.stage = self.home / 'aisuite/kit'
        self.source = self.root / 'arcadia'
        self.source.mkdir()
        (self.source / 'ya').write_text('source executable')
        self.home.mkdir()
        self.config_target = self.root / 'dotfiles/config.toml'
        self.config_target.parent.mkdir()
        self.config_target.write_text('model = "existing"\ndeveloper_instructions = "Personal rules"\n[mcp_servers.personal]\ncommand = "personal-server"\n')
        self.config_target.chmod(0o640)
        (self.home / 'config.toml').symlink_to(self.config_target)

    def generate(self, servers=None, skills=('kit',), rules='KIT rules', environment=None, hooks=None):
        (self.stage / '.codex/rules').mkdir(parents=True, exist_ok=True)
        servers = servers or {'kitsql': {'command': 'kitsql-server'}}
        (self.stage / '.codex/config.toml').write_text(tomlkit.dumps({
            'developer_instructions': rules,
            'mcp_servers': servers,
            'shell_environment_policy': {'inherit': 'none', 'set': environment or {}},
        }))
        (self.stage / '.codex/hooks.json').write_text(json.dumps(hooks or {'hooks': {}}))
        (self.stage / '.codex/rules/aisuite.rules').write_text('prefix_rule(pattern=["kit"], decision="allow")\n')
        for name in skills:
            path = self.stage / '.agents/skills' / name
            path.mkdir(parents=True, exist_ok=True)
            (path / 'SKILL.md').write_text(f'---\nname: {name}\n---\nSkill body\n')

    def setup(self, refresh=False, baseline_config=None):
        with contextlib.redirect_stdout(io.StringIO()):
            KIT.setup(self.source, self.home, refresh=refresh, baseline_config=baseline_config)

    def config(self):
        return tomlkit.parse(self.config_target.read_text()).unwrap()

    def test_import_preserves_config_symlink_unrelated_settings_and_is_idempotent(self):
        self.generate()
        (self.home / 'skills/.system').mkdir(parents=True)
        (self.home / 'skills/.system/keep').write_text('system')
        self.setup()
        self.assertTrue((self.home / 'config.toml').is_symlink())
        self.assertEqual(stat.S_IMODE(self.config_target.stat().st_mode), 0o640)
        config = self.config()
        self.assertEqual(config['model'], 'existing')
        self.assertEqual(config['mcp_servers']['personal']['command'], 'personal-server')
        self.assertEqual(config['mcp_servers']['kitsql']['command'], 'kitsql-server')
        self.assertNotIn('inherit', config['shell_environment_policy'])
        self.assertIn('Personal rules', config['developer_instructions'])
        self.assertEqual(config['developer_instructions'].count(KIT.RULES_START), 1)
        self.assertIn('any Arcadia mount or worktree', config['developer_instructions'])
        self.assertEqual((self.stage / 'rules.md').read_text(), 'KIT rules\n')
        self.assertEqual((self.home / 'skills/kit').readlink(), self.stage / '.agents/skills/kit')
        self.assertEqual((self.home / 'skills/.system/keep').read_text(), 'system')
        before = self.config_target.read_bytes(), self.config_target.stat().st_mtime_ns
        self.setup()
        self.assertEqual(before, (self.config_target.read_bytes(), self.config_target.stat().st_mtime_ns))

    def test_foreign_mcp_conflict_leaves_live_files_unchanged(self):
        self.generate(servers={'personal': {'command': 'different-server'}})
        before = self.config_target.read_bytes()
        with self.assertRaisesRegex(ValueError, 'independent settings'):
            self.setup()
        self.assertEqual(self.config_target.read_bytes(), before)
        self.assertFalse((self.home / 'skills').exists())
        self.assertFalse((self.stage / 'antex-import.json').exists())

    def test_foreign_skill_conflict_is_detected_before_config_write(self):
        self.generate()
        (self.home / 'skills/kit').mkdir(parents=True)
        before = self.config_target.read_bytes()
        with self.assertRaisesRegex(ValueError, 'Existing skill requires review'):
            self.setup()
        self.assertEqual(self.config_target.read_bytes(), before)
        self.assertTrue((self.home / 'skills/kit').is_dir())

    def test_refresh_updates_owned_servers_but_preserves_user_changes(self):
        self.generate()
        self.setup()
        self.generate(servers={'kitsql': {'command': 'kitsql-v2'}})
        self.setup()
        self.assertEqual(self.config()['mcp_servers']['kitsql']['command'], 'kitsql-v2')
        changed = self.config()
        changed['mcp_servers']['kitsql']['command'] = 'user-customization'
        self.config_target.write_text(tomlkit.dumps(changed))
        self.generate(servers={'kitsql': {'command': 'kitsql-v3'}})
        before = self.config_target.read_bytes()
        with self.assertRaisesRegex(ValueError, 'independent settings'):
            self.setup()
        self.assertEqual(self.config_target.read_bytes(), before)

    def test_refresh_removes_only_obsolete_owned_entries(self):
        self.generate(servers={'obsolete': {'command': 'old'}, 'kitsql': {'command': 'kit'}})
        self.setup()
        self.generate(servers={'kitsql': {'command': 'kit'}})
        self.setup()
        self.assertNotIn('obsolete', self.config()['mcp_servers'])
        self.assertIn('personal', self.config()['mcp_servers'])

    def test_generation_is_isolated_and_never_creates_project_artifacts(self):
        def generate(command, **kwargs):
            self.assertEqual(command, [
                str(self.source / 'ya'), 'tool', 'aisuite', 'codex',
                '--preset', 'kit/backend-go', '--no-junk',
                '--arc-root', str(self.source), '--repo-root', str(self.source),
                '--output-dir', str(self.stage), str(self.source),
            ])
            self.assertEqual(kwargs['cwd'], self.stage)
            self.assertEqual(kwargs['env']['CODEX_HOME'], str(self.stage / 'user-config'))
            self.assertTrue(kwargs['check'])
            self.generate()

        with patch.object(KIT.subprocess, 'run', side_effect=generate) as run:
            self.setup()
            self.setup()
            self.assertEqual(run.call_count, 1)
            self.setup(refresh=True)
            self.assertEqual(run.call_count, 2)
        self.assertEqual([path.name for path in self.source.iterdir()], ['ya'])
        state = json.loads((self.stage / 'antex-import.json').read_text())
        self.assertEqual(state['preset'], 'kit/backend-go')

    def test_first_import_adopts_only_matching_baseline_kit_settings(self):
        baseline = self.config()
        baseline['developer_instructions'] = KIT.managed_instructions('Personal rules', self.root / 'previous/rules.md')
        baseline['mcp_servers']['kitsql'] = {'command': '/previous/home/kitsql'}
        baseline['shell_environment_policy'] = {'set': {'BASH_ENV': '/previous/home/shadows.sh', 'PERSONAL': 'keep'}}
        baseline_path = self.root / 'baseline.toml'
        baseline_path.write_text(tomlkit.dumps(baseline))
        self.config_target.write_text(baseline_path.read_text())
        self.generate(environment={'BASH_ENV': '/new/home/shadows.sh'})
        self.setup(baseline_config=baseline_path)
        actual = self.config()
        self.assertEqual(actual['mcp_servers']['kitsql'], {'command': 'kitsql-server'})
        self.assertEqual(actual['mcp_servers']['personal'], baseline['mcp_servers']['personal'])
        self.assertEqual(actual['shell_environment_policy']['set']['BASH_ENV'], '/new/home/shadows.sh')
        self.assertEqual(actual['shell_environment_policy']['set']['PERSONAL'], 'keep')
        actual['mcp_servers']['kitsql']['command'] = 'user-customization'
        self.config_target.write_text(tomlkit.dumps(actual))
        baseline_path.write_text(self.config_target.read_text())
        with self.assertRaisesRegex(ValueError, 'independent settings'):
            self.setup(baseline_config=baseline_path)

    def test_baseline_does_not_adopt_personal_server_names(self):
        baseline = self.config()
        baseline['developer_instructions'] = KIT.managed_instructions('', self.stage / 'rules.md')
        baseline_path = self.root / 'baseline.toml'
        baseline_path.write_text(tomlkit.dumps(baseline))
        self.generate(servers={'personal': {'command': 'replacement'}})
        before = self.config_target.read_bytes()
        with self.assertRaisesRegex(ValueError, 'independent settings'):
            self.setup(baseline_config=baseline_path)
        self.assertEqual(self.config_target.read_bytes(), before)

    def test_refresh_changes_only_owned_environment_values(self):
        self.generate(environment={'BASH_ENV': '/old/shadows.sh', 'ENV': '/old/shadows.sh'})
        self.setup()
        self.generate(environment={'BASH_ENV': '/new/shadows.sh'})
        self.setup()
        actual = self.config()
        self.assertEqual(actual['shell_environment_policy']['set']['BASH_ENV'], '/new/shadows.sh')
        self.assertNotIn('ENV', actual['shell_environment_policy']['set'])
        actual['shell_environment_policy']['set']['BASH_ENV'] = '/personal/shadows.sh'
        self.config_target.write_text(tomlkit.dumps(actual))
        self.generate(environment={'BASH_ENV': '/latest/shadows.sh'})
        before = self.config_target.read_bytes(), (self.home / 'hooks.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'shell environment setting requires review'):
            self.setup()
        self.assertEqual(before, (self.config_target.read_bytes(), (self.home / 'hooks.json').read_bytes()))

    def test_personal_hook_decisions_survive_managed_hook_reordering(self):
        managed = {'type': 'command', 'command': 'old-kit-hook', '__kit_aisuite': True}
        disabled = {'type': 'command', 'command': 'disabled-personal-hook'}
        changed = {'type': 'command', 'command': 'changed-personal-hook'}
        trusted = {'type': 'command', 'command': 'trusted-personal-hook'}
        existing_hooks = {'hooks': {'Stop': [{'hooks': [handler]} for handler in (managed, disabled, changed, trusted)]}}
        (self.home / 'hooks.json').write_text(json.dumps(existing_hooks))
        source = str(self.home / 'hooks.json')
        trusted_state = {'trusted_hash': hook_hash('Stop', {}, trusted)}
        before = self.config()
        before['hooks'] = {'state': {
            f'{source}:stop:1:0': {'enabled': False},
            f'{source}:stop:2:0': {'trusted_hash': 'sha256:previous-command'},
            f'{source}:stop:3:0': trusted_state,
            'other-profile:stop:0:0': {'enabled': False},
        }}
        self.config_target.write_text(tomlkit.dumps(before))
        generated_hook = {'type': 'command', 'command': 'new-kit-hook'}
        self.generate(hooks={'hooks': {'Stop': [{'hooks': [generated_hook]}]}})
        self.setup()
        decisions = self.config()['hooks']['state']
        self.assertEqual(decisions[f'{source}:stop:0:0'], {'enabled': False})
        self.assertEqual(decisions[f'{source}:stop:1:0'], {'trusted_hash': 'sha256:previous-command'})
        self.assertEqual(decisions[f'{source}:stop:2:0'], trusted_state)
        self.assertEqual(decisions[f'{source}:stop:3:0'], {'trusted_hash': hook_hash('Stop', {}, generated_hook)})
        self.assertEqual(decisions['other-profile:stop:0:0'], {'enabled': False})

    def test_global_hook_params_accept_shell_quoting_and_preserve_other_params(self):
        params = {'_search_scope': {'additional_directories': ["/old/O'Brien/project"]}, 'other': "O'Brien"}
        encoded = json.dumps(params)
        words = (
            shlex.quote(encoded),
            '"' + encoded.replace('\\', '\\\\').replace('"', '\\"') + '"',
        )
        for word in words:
            for separator in (' ', '='):
                with self.subTest(word=word, separator=separator):
                    command = '{\n  aisuite hook --params' + separator + word + ' --timeout-sec 3\n} || true'
                    actual = global_command(command)
                    parts = shlex.split(actual)
                    actual_params = json.loads(parts[parts.index('--params') + 1])
                    self.assertEqual(actual_params, {'_search_scope': {'additional_directories': []}, 'other': "O'Brien"})
                    self.assertTrue(actual.startswith('{\n  aisuite hook '))
                    self.assertTrue(actual.endswith(' --timeout-sec 3\n} || true'))


if __name__ == '__main__':
    unittest.main()
