#!/usr/bin/env python3
"""Фоновый рефрешер номера PR (review-request) Arcanum для starship.

Промпт НЕ вызывает это на render-пути. zsh precmd-хук (см. ~/.zshrc) считает
root/branch в шелле и, если кэш протух, запускает это отцепленно. Скрипт пишет
готовый к печати файл, который starship-модуль просто `cat`-ает.

  arc-pr.py refresh <root> <branch> <base>
    пишет <base>.pr -> "(#14031057)" либо пусто
"""
import json
import os
import subprocess
import sys


def arc(args, cwd=None):
    try:
        return subprocess.run(
            ["arc"] + args, cwd=cwd,
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
    # arc pr status резолвит локальную ветку -> remote -> review-request.
    # На ветке без PR (в т.ч. trunk) вывод — текст, не JSON, отсюда try/except.
    out = arc(["pr", "status", branch or "", "--json"], cwd=root)
    try:
        j = json.loads(out)
        num = j.get("id")
        if num and j.get("status") not in ("merged", "discarded", "closed"):
            pr_out = f"(#{num})"
    except Exception:
        pr_out = ""
    write_atomic(base + ".pr", pr_out)


def main():
    if len(sys.argv) >= 5 and sys.argv[1] == "refresh":
        refresh(sys.argv[2], sys.argv[3], sys.argv[4])


if __name__ == "__main__":
    main()
