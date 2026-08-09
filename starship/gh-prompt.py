#!/usr/bin/env python3
"""Background refresher for the starship GitHub PR module.

The prompt NEVER calls this on the render path. A zsh precmd hook (see ~/.zshrc)
computes repo/branch in-shell and, when the cache is stale, spawns this detached.
It writes a ready-to-print file the starship module just `cat`s.

  gh-prompt.py refresh <root> <branch> <base>
    writes <base>.pr -> "(#123)" or empty
"""
import os
import subprocess
import sys


def gh(args, cwd=None):
    try:
        return subprocess.run(
            ["gh"] + args, cwd=cwd,
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
    except Exception:
        return ""


def write_atomic(path, content):
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        f.write(content)
    os.replace(tmp, path)


def refresh(root, branch, base):
    os.makedirs(os.path.dirname(base), exist_ok=True)
    pr_out = ""
    if root and gh(["repo", "view", "--json", "nameWithOwner",
                    "-q", ".nameWithOwner"], cwd=root):
        pr = gh(["pr", "view", branch or "", "--json", "number",
                 "-q", ".number"], cwd=root)
        if pr:
            pr_out = f"(#{pr})"
    write_atomic(base + ".pr", pr_out)


def main():
    if len(sys.argv) >= 5 and sys.argv[1] == "refresh":
        refresh(sys.argv[2], sys.argv[3], sys.argv[4])


if __name__ == "__main__":
    main()
