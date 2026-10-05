#!/usr/bin/env python3
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys

HOME_DIR = Path.home()
SOURCE_ROOT = HOME_DIR / 'arcadia'
STATE_DIR = HOME_DIR / '.local/state/kit-aisuite'


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE_DIR / 'setup.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        mounts = json.loads(subprocess.check_output(['/usr/local/bin/arc', 'mount', '--list', '--json'], text=True))
        if not (SOURCE_ROOT / 'ya').is_file():
            return 0
        ready = (SOURCE_ROOT / 'yastore/mcp/kitsql/kitsql').is_file()
        failures = []
        for entry in mounts:
            if entry.get('status') != 'mounted' or entry.get('tenant') != 'arcadia':
                continue
            mount = Path(entry['mount'])
            state = mount / '.aisuite/setup_state.json'
            installed = False
            if state.is_file():
                data = json.loads(state.read_text())
                installed = data.get('command') == 'codex' and 'kit/backend-go' in data.get('arguments', {}).get('preset', [])
                if not installed and not args.refresh:
                    print('Retaining existing AISuite setup:', mount, flush=True)
                    continue
            bridge = mount / '.antex'
            if bridge.exists() or bridge.is_symlink():
                if not bridge.is_symlink() or bridge.resolve() != (mount / '.codex').resolve():
                    print('Existing Antex project config requires review:', bridge, flush=True)
                    failures.append(str(mount))
                    continue
            if not installed or args.refresh:
                if not ready:
                    print('KIT SQL binary unavailable; build it before installing:', mount, flush=True)
                    failures.append(str(mount))
                    continue
                command = [str(SOURCE_ROOT / 'ya'), 'tool', 'aisuite', 'codex', '--preset', 'kit/backend-go', '--no-junk', '--arc-root', str(SOURCE_ROOT), '--repo-root', str(mount), '--output-dir', str(mount), str(mount)]
                child_env = os.environ.copy()
                child_env['CODEX_HOME'] = child_env.get('ANTEX_HOME') or str(HOME_DIR / '.antex')
                result = subprocess.run(command, cwd=mount, env=child_env, timeout=600)
                if result.returncode:
                    failures.append(str(mount))
                    continue
            if not bridge.is_symlink():
                bridge.symlink_to('.codex', target_is_directory=True)
                print('Antex project configuration linked:', mount, flush=True)
            marker = mount / '.aisuite/kit-worktree.json'
            marker_text = json.dumps({'preset': 'kit/backend-go', 'source': str(SOURCE_ROOT), 'mount': str(mount)}, indent=2) + '\n'
            if not marker.exists() or marker.read_text() != marker_text:
                marker.write_text(marker_text)
                marker.chmod(0o600)
        return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(run())
