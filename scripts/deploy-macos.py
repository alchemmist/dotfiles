#!/usr/bin/env python3
import argparse
import os
import plistlib
import shlex
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
HOME_DIR = Path.home()
LAUNCH_AGENTS = (
    ('macos/org.alchemmist.arcadia-mount.plist', 'org.alchemmist.arcadia-mount'),
    ('macos/org.alchemmist.syncthing.plist', 'org.alchemmist.syncthing'),
    ('hammerspoon/org.alchemmist.hammerspoon.plist', 'org.alchemmist.hammerspoon'),
)


def relocate(value, home):
    if isinstance(value, str):
        return value.replace('/Users/antonmoss', str(home))
    if isinstance(value, list):
        return [relocate(item, home) for item in value]
    if isinstance(value, dict):
        return {key: relocate(item, home) for key, item in value.items()}
    return value


def render(root=REPO_ROOT, home=HOME_DIR):
    destination = root / '.private/macos/launchagents'
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    for source, label in LAUNCH_AGENTS:
        content = relocate(plistlib.loads((root / source).read_bytes()), home)
        target = destination / (label + '.plist')
        encoded = plistlib.dumps(content, sort_keys=False)
        if not target.exists() or target.read_bytes() != encoded:
            target.write_bytes(encoded)


def run(command, **kwargs):
    subprocess.run([str(value) for value in command], check=True, **kwargs)


def configure_desktop():
    logs = HOME_DIR / '.local/state/arcadia-mount'
    logs.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ('stdout.log', 'stderr.log'):
        path = logs / name
        path.touch(mode=0o600, exist_ok=True)
        path.chmod(0o600)
    run(['/usr/bin/defaults', 'write', 'com.apple.finder', 'ShowSidebar', '-bool', 'true'])
    domain = f'gui/{os.getuid()}'
    for _, label in LAUNCH_AGENTS:
        path = HOME_DIR / 'Library/LaunchAgents' / (label + '.plist')
        if not path.is_file():
            raise RuntimeError(f'Dotter has not deployed {path}')
        probe = subprocess.run(['/bin/launchctl', 'print', f'{domain}/{label}'], capture_output=True, check=False)
        if probe.returncode:
            run(['/bin/launchctl', 'bootstrap', domain, path])


def configure_agents():
    python = HOME_DIR / '.venvs/stefania/bin/python'
    arcadia = Path(os.environ.get('ARCADIA_ROOT', HOME_DIR / 'arcadia')).expanduser()
    source = arcadia / 'zootopia/analytics/ml/stefania'
    if not (source / 'agent-core/references/skills-catalog.md').is_file():
        raise RuntimeError('Mount Arcadia with corporate access, then rerun dotter deploy to install Stefania and KIT.')
    customize = HOME_DIR / '.stefania/customize.env'
    if not customize.exists():
        customize.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with customize.open('x') as stream:
            stream.write(f'export STEFANIA_PYTHON={shlex.quote(str(python))}\n')
            stream.write(f'export STEFANIA_PROJECT_DIR={shlex.quote(str(source))}\n')
        customize.chmod(0o600)
    restore = [python, REPO_ROOT / 'scripts/restore-stefania.py', '--source-root', source, '--python', python]
    probe = subprocess.run([str(value) for value in restore] + ['--check'], capture_output=True, check=False)
    if probe.returncode:
        run(restore)
    binary = arcadia / 'yastore/mcp/kitsql/kitsql'
    if not binary.is_file():
        run([arcadia / 'ya', 'make', '-r', arcadia / 'yastore/mcp/kitsql'], cwd=arcadia)
    token_file = HOME_DIR / '.mcp/token'
    if not token_file.is_file() or not token_file.stat().st_size:
        token = os.environ.get('IDP_MCP_TOKEN')
        if not token:
            raise RuntimeError('Restore corporate credentials including IDP_MCP_TOKEN, then rerun dotter deploy.')
        token_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(token.strip() + '\n')
    setup = [python, REPO_ROOT / 'scripts/ensure-kit-aisuite.py', '--source-root', arcadia]
    if not (HOME_DIR / '.antex/aisuite/kit/antex-import.json').is_file():
        setup += ['--baseline-config', REPO_ROOT / 'antex/config.toml']
    run(setup)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('render', 'apply'))
    arguments = parser.parse_args()
    if sys.platform != 'darwin':
        return 0
    if arguments.action == 'render':
        render()
        return 0
    try:
        configure_desktop()
        configure_agents()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'macOS setup incomplete: {error}', file=sys.stderr)
        return 1
    print('macOS settings, login services, Stefania and KIT are ready.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
