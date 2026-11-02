import argparse
import subprocess
import sys
from pathlib import Path

SCRIPTS = {
    "pi": "tmux-pi-fork.py",
    "antex": "tmux-antex-fork.py",
    "codex": "tmux-codex-fork.py",
}

def descendant_agents(root):
    result = subprocess.run(["ps", "-ax", "-o", "pid=,ppid=,command="], capture_output=True, text=True, check=False)
    children = {}
    commands = {}
    for line in result.stdout.splitlines():
        parts = line.split(None, 2)
        if len(parts) < 3:
            continue
        pid, parent, command = int(parts[0]), int(parts[1]), parts[2]
        commands[pid] = command
        children.setdefault(parent, []).append(pid)
    found = []
    pending = [(int(root), 0)]
    seen = set()
    while pending:
        pid, depth = pending.pop(0)
        if pid in seen:
            continue
        seen.add(pid)
        for child in children.get(pid, []):
            pending.append((child, depth + 1))
        command = commands.get(pid, "")
        token = command.split(None, 1)[0] if command else ""
        name = Path(token).name
        if name in SCRIPTS:
            found.append((depth, name))
    return found

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pane", required=True)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    tmux = ["tmux", "-S", args.socket]
    try:
        metadata = subprocess.check_output(
            [*tmux, "display-message", "-p", "-t", args.pane, "#{pane_pid}\n#{pane_current_command}"],
            text=True,
        ).rstrip("\n").split("\n")
        if len(metadata) != 2:
            raise ValueError("Could not resolve the source pane")
        pid, command = metadata
        agents = descendant_agents(pid)
        current = Path(command).name.lower()
        if current in SCRIPTS and not any(name == current for _, name in agents):
            agents.append((0, current))
        if not agents:
            raise ValueError("This pane is not running Pi, Antex, or Codex")
        kind = sorted(agents)[0][1]
        script = Path(__file__).resolve().parent / SCRIPTS[kind]
        command = [sys.executable, str(script), "--pane", args.pane, "--socket", args.socket]
        if args.dry_run:
            command.append("--dry-run")
        completed = subprocess.run(command, check=False)
        return completed.returncode
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        message = f"Agent fork: {error}"
        print(message, file=sys.stderr)
        if not args.dry_run:
            subprocess.run([*tmux, "display-message", message], check=False)
        return 1

if __name__ == "__main__":
    sys.exit(main())
