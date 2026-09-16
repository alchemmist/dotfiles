import argparse
import json
import shlex
import subprocess
import sys
import uuid


def fork_plan(tmux, pane, antex):
    if not pane.startswith("%") or not pane[1:].isdigit():
        raise ValueError("Expected an explicit tmux pane ID")
    metadata = (
        subprocess.check_output(
            [
                *tmux,
                "display-message",
                "-p",
                "-t",
                pane,
                "#{session_id}\n#{pane_id}\n#{pane_current_path}\n#{pane_current_command}",
            ],
            text=True,
        )
        .rstrip("\n")
        .split("\n")
    )
    if len(metadata) != 4:
        raise ValueError("Could not resolve the source pane")
    session, actual_pane, cwd, command = metadata
    if actual_pane != pane or not session.startswith("$"):
        raise ValueError("Source pane changed or is unavailable")
    if "antex" not in command.lower():
        raise ValueError("The source pane is not running Antex")
    result = subprocess.run(
        [*tmux, "show-options", "-p", "-v", "-t", pane, "@antex_thread_id"],
        capture_output=True,
        text=True,
        check=False,
    )
    thread = result.stdout.strip()
    if result.returncode or not thread:
        raise ValueError(
            "This pane has no Antex thread ID; refusing to guess from its directory"
        )
    uuid.UUID(thread)
    return [
        *tmux,
        "new-window",
        "-t",
        session + ":",
        "-n",
        "fork-" + thread[:8],
        "-c",
        cwd,
        shlex.join([antex, "fork", thread]),
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pane", required=True)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--antex-bin", default="antex")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    tmux = ["tmux", "-S", args.socket]
    try:
        plan = fork_plan(tmux, args.pane, args.antex_bin)
        if args.dry_run:
            print(json.dumps(plan))
        else:
            subprocess.run(plan, check=True)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        message = f"Antex fork: {error}"
        print(message, file=sys.stderr)
        if not args.dry_run:
            subprocess.run([*tmux, "display-message", message], check=False)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
