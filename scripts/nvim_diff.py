#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def launch(command: str, arguments: list[str] | None = None) -> int:
    env = os.environ.copy()
    if arguments is not None:
        env["NDIFF_ARGUMENTS"] = json.dumps(arguments)
    return subprocess.call(["nvim", "-c", command], env=env)


def repository_main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    command = "lua require('ndiff').start(vim.json.decode(vim.env.NDIFF_ARGUMENTS))"
    return launch(command, arguments)


def patch_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nvimd")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("patch", nargs="?")
    args = parser.parse_args(argv)
    if args.patch:
        try:
            data = Path(args.patch).read_bytes()
        except OSError as error:
            print(f"nvimd: {error}", file=sys.stderr)
            return 1
    else:
        if sys.stdin.isatty():
            print("nvimd: pipe a diff or pass a patch file", file=sys.stderr)
            return 1
        data = sys.stdin.buffer.read()
    if args.dry_run:
        print(json.dumps({"mode": "patch", "bytes": len(data)}))
        return 0
    with tempfile.TemporaryDirectory(prefix="nvimd-") as temp:
        patch = Path(temp) / "input.diff"
        patch.write_bytes(data)
        env = os.environ.copy()
        env["NDIFF_PATCH"] = str(patch)
        command = "lua require('ndiff').open(vim.env.NDIFF_PATCH)"
        return subprocess.call(["nvim", "-c", command], env=env)
