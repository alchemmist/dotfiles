import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path

def process_command(pid):
    result = subprocess.run(["ps", "-ww", "-o", "command=", "-p", str(pid)], capture_output=True, text=True, check=False)
    return result.stdout.strip()

def descendant_commands(root):
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
    pending = [int(root)]
    seen = set()
    while pending:
        pid = pending.pop(0)
        if pid in seen:
            continue
        seen.add(pid)
        pending.extend(children.get(pid, []))
        command = commands.get(pid, "")
        token = command.split(None, 1)[0] if command else ""
        name = Path(token).name
        if name in {"pi", "antex", "codex", "claude"}:
            found.append((pid, name))
    return found

def binding_file(tmux, pane):
    result = subprocess.run([*tmux, "show-options", "-p", "-v", "-t", pane, "@lazy_tmux_pi_binding"], capture_output=True, text=True, check=False)
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        binding = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    file = binding.get("file") if isinstance(binding, dict) else None
    if isinstance(file, str) and file:
        return Path(file)
    return None

def session_file(pid, cwd):
    result = subprocess.run(["lsof", "-n", "-p", pid], capture_output=True, text=True, check=False)
    candidates = [Path(line.split(None, 8)[-1]) for line in result.stdout.splitlines() if ".jsonl" in line and "/.pi/agent/sessions/" in line]
    if candidates:
        return candidates[0]
    encoded = "--" + cwd.strip("/").replace("/", "-") + "--"
    directory = Path.home() / ".pi" / "agent" / "sessions" / encoded
    files = list(directory.glob("*.jsonl"))
    if not files:
        raise ValueError("Could not find the active Pi session file")
    return max(files, key=lambda path: path.stat().st_mtime)

def fork_plan(tmux, pane, pi):
    metadata = subprocess.check_output([*tmux, "display-message", "-p", "-t", pane, "#{session_id}\n#{pane_id}\n#{pane_current_path}\n#{pane_current_command}\n#{pane_pid}"], text=True).rstrip("\n").split("\n")
    if len(metadata) != 5:
        raise ValueError("Could not resolve the source pane")
    session, actual_pane, cwd, command, pid = metadata
    if actual_pane != pane or not session.startswith("$"):
        raise ValueError("Source pane changed or is unavailable")
    agents = descendant_commands(pid)
    pi_pids = [agent for agent, name in agents if name == "pi"]
    shell_runs_pi = command.lower() in {"pi", "node"} or " pi" in process_command(pid).lower() or bool(pi_pids)
    if not shell_runs_pi:
        raise ValueError("The source pane is not running Pi")
    source = binding_file(tmux, pane)
    if source is None:
        source = session_file(pi_pids[0] if pi_pids else pid, cwd)
    return [*tmux, "new-window", "-t", session + ":", "-n", "fork-pi", "-c", cwd, shlex.join([pi, "--fork", str(source)])]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pane", required=True)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--pi-bin", default="pi")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    tmux = ["tmux", "-S", args.socket]
    try:
        plan = fork_plan(tmux, args.pane, args.pi_bin)
        if args.dry_run:
            print(shlex.join(plan))
        else:
            subprocess.run(plan, check=True)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        message = f"Pi fork: {error}"
        print(message, file=sys.stderr)
        if not args.dry_run:
            subprocess.run([*tmux, "display-message", message], check=False)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
