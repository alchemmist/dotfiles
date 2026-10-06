#!/usr/bin/env python3
import argparse
import fcntl
import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

import tomlkit

sys.dont_write_bytecode = True

from kit_aisuite_runtime import MANAGED_ENV_KEYS, merge_runtime

RULES_START = '<!-- kit-aisuite:start -->'
RULES_END = '<!-- kit-aisuite:end -->'
KIT_MCP_NAMES = {'ci', 'cirp', 'devtools', 'intrasearch', 'kitsql', 'monium_mcp', 'tracker_mcp', 'yql'}


def write_file(path, text):
    target = path.resolve()
    if target.exists() and target.read_text() == text:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(target.stat().st_mode) if target.exists() else 0o600
    fd, temporary = tempfile.mkstemp(prefix=f'.{target.name}.', dir=target.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def managed_instructions(existing, rules_path):
    block = (
        f'{RULES_START}\n'
        'For KIT / yastore tasks in any Arcadia mount or worktree, '
        f'read and follow the KIT preset rules in `{rules_path}`. '
        'Apply these rules only to KIT / yastore work in Arcadia.\n'
        f'{RULES_END}'
    )
    if RULES_START not in existing and RULES_END not in existing:
        return f'{existing}\n\n{block}' if existing else block
    if existing.count(RULES_START) != 1 or existing.count(RULES_END) != 1:
        raise ValueError('Invalid managed KIT instruction markers in Antex config')
    before, remainder = existing.split(RULES_START, 1)
    if RULES_END not in remainder:
        raise ValueError('Invalid managed KIT instruction marker order')
    _, after = remainder.split(RULES_END, 1)
    return before + block + after


def matches_link(path, source):
    if not path.is_symlink():
        return False
    return os.path.abspath(path.parent / os.readlink(path)) == str(source)


def initial_state(baseline_path, new_servers):
    if baseline_path is None:
        return {}
    baseline = tomlkit.parse(baseline_path.read_text()).unwrap()
    instructions = baseline.get('developer_instructions', '')
    if RULES_START not in instructions or RULES_END not in instructions:
        raise ValueError(f'Baseline has no managed KIT instructions: {baseline_path}')
    servers = baseline.get('mcp_servers', {})
    environment = baseline.get('shell_environment_policy', {}).get('set', {})
    return {
        'mcp_servers': {name: servers[name] for name in KIT_MCP_NAMES & new_servers.keys() & servers.keys()},
        'shell_environment': {name: environment[name] for name in MANAGED_ENV_KEYS if name in environment},
    }


def import_generated(antex_home, stage, baseline_config=None):
    generated_path = stage / '.codex/config.toml'
    generated = tomlkit.parse(generated_path.read_text()).unwrap()
    new_servers = generated.get('mcp_servers', {})
    rules = generated.get('developer_instructions', '')
    if not isinstance(new_servers, dict) or not new_servers:
        raise ValueError(f'No MCP servers in {generated_path}')
    if not isinstance(rules, str) or not rules.strip():
        raise ValueError(f'No developer instructions in {generated_path}')
    skills_root = stage / '.agents/skills'
    skills = sorted(path.name for path in skills_root.iterdir() if (path / 'SKILL.md').is_file())
    if not skills:
        raise ValueError(f'No skills in {skills_root}')

    state_path = stage / 'antex-import.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else initial_state(baseline_config, new_servers)
    old_servers = state.get('mcp_servers', {})
    config_path = antex_home / 'config.toml'
    previous = config_path.read_text() if config_path.exists() else ''
    config = tomlkit.parse(previous)
    current = config.unwrap()
    current_servers = current.get('mcp_servers', {})
    if not isinstance(current_servers, dict):
        raise TypeError(f'Invalid MCP configuration in {config_path}')
    for name in sorted(set(old_servers) | set(new_servers)):
        if name not in current_servers:
            continue
        value = current_servers[name]
        if name in new_servers and value == new_servers[name]:
            continue
        if name in old_servers and value == old_servers[name]:
            continue
        raise ValueError(f'MCP server {name!r} has independent settings; preserving {config_path}')

    destinations = antex_home / 'skills'
    old_skills = state.get('skills', [])
    for name in sorted(set(old_skills) | set(skills)):
        if Path(name).name != name or name in ('.', '..'):
            raise ValueError(f'Invalid skill name: {name!r}')
        target = destinations / name
        if (target.exists() or target.is_symlink()) and not matches_link(target, skills_root / name):
            raise ValueError(f'Existing skill requires review: {target}')

    generated_execution_rules = stage / '.codex/rules/aisuite.rules'
    execution_rules = generated_execution_rules.read_text() if generated_execution_rules.exists() else None
    execution_target = antex_home / 'rules/kit-aisuite.rules'
    if execution_target.exists():
        current_execution_rules = execution_target.read_text()
        if current_execution_rules != execution_rules and digest(current_execution_rules) != state.get('execution_rules_sha256'):
            raise ValueError(f'Existing execution rules require review: {execution_target}')
    if execution_target.is_symlink():
        raise ValueError(f'Execution rules must not replace a symlink: {execution_target}')

    existing_instructions = current.get('developer_instructions', '')
    if not isinstance(existing_instructions, str):
        raise TypeError(f'Invalid developer instructions in {config_path}')
    config['developer_instructions'] = managed_instructions(existing_instructions, stage / 'rules.md')
    servers = config.setdefault('mcp_servers', tomlkit.table())
    for name in old_servers.keys() - new_servers.keys():
        servers.pop(name, None)
    for name, value in new_servers.items():
        if current_servers.get(name) != value:
            servers[name] = value

    hooks_path = antex_home / 'hooks.json'
    previous_hooks = hooks_path.read_text() if hooks_path.exists() else '{}'
    generated_hooks_path = stage / '.codex/hooks.json'
    generated_hooks = json.loads(generated_hooks_path.read_text()) if generated_hooks_path.exists() else {}
    config, hooks = merge_runtime(
        config, json.loads(previous_hooks), generated, generated_hooks, antex_home,
        previous_env=state.get('shell_environment', {}),
    )
    if (config_path.read_text() if config_path.exists() else '') != previous:
        raise ValueError(f'Configuration changed during import: {config_path}')
    if (hooks_path.read_text() if hooks_path.exists() else '{}') != previous_hooks:
        raise ValueError(f'Hooks changed during import: {hooks_path}')
    hooks_backup = stage / 'original-hooks.json'
    if not hooks_backup.exists():
        write_file(hooks_backup, previous_hooks)
    write_file(stage / 'rules.md', rules.rstrip() + '\n')
    destinations.mkdir(parents=True, exist_ok=True)
    for name in skills:
        target = destinations / name
        if not target.is_symlink():
            target.symlink_to(skills_root / name, target_is_directory=True)
    for name in set(old_skills) - set(skills):
        target = destinations / name
        if target.is_symlink():
            target.unlink()
    if execution_rules is not None:
        write_file(execution_target, execution_rules)
    elif execution_target.exists():
        execution_target.unlink()
    write_file(hooks_path, json.dumps(hooks, indent=2, ensure_ascii=False) + '\n')
    write_file(config_path, tomlkit.dumps(config))
    state = {
        'preset': 'kit/backend-go',
        'mcp_servers': new_servers,
        'skills': skills,
        'execution_rules_sha256': digest(execution_rules) if execution_rules is not None else None,
        'shell_environment': {
            name: value for name, value in generated.get('shell_environment_policy', {}).get('set', {}).items()
            if name in MANAGED_ENV_KEYS
        },
    }
    write_file(state_path, json.dumps(state, indent=2, sort_keys=True) + '\n')
    print(f'KIT: {len(new_servers)} MCP servers, {len(skills)} skills; config: {config_path}; rules: {stage / "rules.md"}')


def setup(source_root, antex_home, refresh=False, baseline_config=None):
    source_root = source_root.expanduser().resolve()
    antex_home = antex_home.expanduser().resolve()
    stage = antex_home / 'aisuite/kit'
    stage.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (stage / 'setup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if refresh or not (stage / '.codex/config.toml').is_file():
            if not (source_root / 'ya').is_file():
                raise ValueError(f'Arcadia ya is unavailable: {source_root / "ya"}')
            metadata_home = stage / 'user-config'
            metadata_home.mkdir(exist_ok=True, mode=0o700)
            child_env = os.environ.copy()
            child_env['CODEX_HOME'] = str(metadata_home)
            command = [
                str(source_root / 'ya'), 'tool', 'aisuite', 'codex',
                '--preset', 'kit/backend-go', '--no-junk',
                '--arc-root', str(source_root), '--repo-root', str(source_root),
                '--output-dir', str(stage), str(source_root),
            ]
            subprocess.run(command, cwd=stage, env=child_env, timeout=600, check=True)
        import_generated(antex_home, stage, baseline_config)


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--source-root', type=Path, default=Path.home() / 'arcadia')
    parser.add_argument('--antex-home', type=Path, default=Path(os.environ.get('ANTEX_HOME') or Path.home() / '.antex'))
    parser.add_argument('--baseline-config', type=Path)
    args = parser.parse_args()
    try:
        setup(args.source_root, args.antex_home, args.refresh, args.baseline_config)
    except (OSError, ValueError, TypeError, subprocess.SubprocessError) as error:
        print(f'KIT setup failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(run())
