import os
from pathlib import Path
import shlex
import subprocess
import sys


def tmux(*args):
    return subprocess.check_output(['tmux', *args], text=True)


def main():
    action = sys.argv[1]
    metadata = tmux('display-message', '-p', '#{pane_id}|#{session_id}-#{window_index}-#{pane_index}|#{pane_height}|#{mode-keys}|#{scroll_position}', ';', 'show-options', '-g')
    header, _, options_text = metadata.partition('\n')
    pane, identity, height, mode, scroll = header.split('|')
    identity = identity.replace('$', '')
    height = int(height)
    options = {}
    for line in options_text.splitlines():
        parts = shlex.split(line)
        if len(parts) == 2:
            options[parts[0]] = parts[1]
    active_key = '@copycat_mode_' + identity
    position_key = '@copycat_position_' + identity
    folder = Path(os.environ.get('TMPDIR', '/tmp')) / f'tmux-{os.geteuid()}-copycat'
    scrollback = folder / ('scrollback-' + identity)
    results = folder / ('results-' + identity)
    active = options.get(active_key) == 'true'
    commands = []

    def add(*args):
        if commands:
            commands.append(';')
        commands.extend(str(arg) for arg in args)

    if action == 'start' and not active:
        text = tmux('capture-pane', '-t', pane, '-S', str(-height), '-p')
        lines = text.splitlines()
        found = subprocess.run(['grep', '-oniE', '--', sys.argv[2]], input='\n'.join(reversed(lines)) + '\n', text=True, capture_output=True)
        if found.returncode not in (0, 1):
            raise RuntimeError(found.stderr.strip())
        if not found.stdout:
            tmux('display-message', 'No results!')
            return
        folder.mkdir(mode=0o700, exist_ok=True)
        scrollback.write_text(text)
        results.write_text(found.stdout)
        position = 0
        add('set-option', '-g', active_key, 'true')
        add('set-option', '-g', '@copycat_counter', int(options.get('@copycat_counter', '0')) + 1)
    else:
        if not active:
            return
        lines = scrollback.read_text().splitlines()
        position = int(options.get(position_key, '0'))
    matches = []
    offsets = {}
    for result in results.read_text().splitlines():
        number, match = result.split(':', 1)
        index = int(number) - 1
        line = lines[-index - 1]
        start = line.index(match, offsets.get(index, 0))
        offsets[index] = start + len(match)
        matches.append((index, start, match))
    position = min(len(matches), position + 1) if action != 'prev' else max(1, position - 1)
    index, start, match = matches[position - 1]
    row = height - 1 - index + int(scroll or 0)
    add('copy-mode', '-t', pane)
    for command in ('clear-selection', 'top-line'):
        add('send-keys', '-t', pane, '-X', command)
    if row:
        add('send-keys', '-t', pane, '-X', '-N', abs(row), 'cursor-down' if row > 0 else 'cursor-up')
    add('send-keys', '-t', pane, '-X', 'start-of-line')
    if start:
        add('send-keys', '-t', pane, '-X', '-N', start, 'cursor-right')
    add('send-keys', '-t', pane, '-X', 'begin-selection')
    length = len(match) - (mode == 'vi')
    if length:
        add('send-keys', '-t', pane, '-X', '-N', length, 'cursor-right')
    add('set-option', '-g', position_key, position)
    tmux(*commands)


if __name__ == '__main__':
    main()
