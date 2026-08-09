#!/usr/bin/env python3

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath


@dataclass
class PatchFile:
    old_path: str | None = None
    new_path: str | None = None
    old_lines: list[str] = field(default_factory=list)
    new_lines: list[str] = field(default_factory=list)
    hunks: int = 0
    changed: bool = False


def run(args: list[str], cwd: Path) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False
    )


def command_root(command: list[str], cwd: Path) -> Path | None:
    if shutil.which(command[0]) is None:
        return None
    result = run(command, cwd)
    if result.returncode != 0:
        return None
    value = result.stdout.decode(errors="replace").strip()
    if not value:
        return None
    root = Path(value).resolve()
    try:
        cwd.resolve().relative_to(root)
    except ValueError:
        return None
    return root


def repository(cwd: Path) -> tuple[str, Path] | None:
    candidates = []
    arc_root = command_root(["arc", "root"], cwd)
    git_root = command_root(["git", "rev-parse", "--show-toplevel"], cwd)
    if arc_root:
        candidates.append(("arc", arc_root))
    if git_root:
        candidates.append(("git", git_root))
    if not candidates:
        return None
    return max(candidates, key=lambda item: len(item[1].parts))


def safe_path(value: str) -> Path:
    value = value.replace("\\", "/")
    parts = [
        part for part in PurePosixPath(value).parts if part not in {"", "/", ".", ".."}
    ]
    if not parts:
        return Path("diff.txt")
    return Path(*parts[-12:])


def write_file(root: Path, relative: Path, content: bytes) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


def repository_path(root: Path, value: str) -> Path | None:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        return None
    target = (root / relative).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        return None
    return target


def normalize_repository_paths(root: Path, cwd: Path, values: list[str]) -> list[str]:
    paths = []
    for value in values:
        target = Path(value)
        if not target.is_absolute():
            target = cwd / target
        try:
            relative = target.resolve().relative_to(root.resolve())
        except ValueError as error:
            raise ValueError(f"path is outside repository: {value}") from error
        paths.append(relative.as_posix())
    return list(dict.fromkeys(paths))


def path_selected(path: str, pathspecs: list[str] | None) -> bool:
    if not pathspecs:
        return True
    parts = PurePosixPath(path).parts
    return any(
        parts[: len(PurePosixPath(item).parts)] == PurePosixPath(item).parts
        for item in pathspecs
    )


def arc_snapshots(
    root: Path, before: Path, after: Path, pathspecs: list[str] | None = None
) -> list[str]:
    status = run(["arc", "status", "--json", "-u", "all"], root)
    if status.returncode != 0:
        raise RuntimeError("arc status failed")
    payload = json.loads(status.stdout)
    entries = payload.get("status", {}).get("changed", [])
    paths = []
    for entry in entries:
        if entry.get("type") not in {None, "file", "symlink"}:
            continue
        raw_path = entry.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            continue
        if not path_selected(raw_path, pathspecs):
            continue
        working = repository_path(root, raw_path)
        if working is None:
            continue
        relative = safe_path(raw_path)
        paths.append(relative.as_posix())
        original = run(["arc", "show", f"HEAD:{raw_path}"], root)
        if original.returncode == 0:
            write_file(before, relative, original.stdout)
        if working.is_file():
            write_file(after, relative, working.read_bytes())
    return sorted(set(paths))


def launch_git(root: Path, dry_run: bool, paths: list[str]) -> int:
    if dry_run:
        print(json.dumps({"vcs": "git", "root": str(root), "paths": paths}))
        return 0
    env = os.environ.copy()
    env["NVIM_DIFF_PATHS"] = json.dumps(paths)
    command = "lua local paths = vim.json.decode(vim.env.NVIM_DIFF_PATHS); local args = {}; if #paths > 0 then args = { '--' }; vim.list_extend(args, paths) end; vim.cmd({ cmd = 'CodeDiff', args = args })"
    return subprocess.call(["nvim", "-c", command], cwd=root, env=env)


def launch_directories(
    before: Path, after: Path, cwd: Path, dry_run: bool, files: list[str]
) -> int:
    if dry_run:
        print(
            json.dumps(
                {"before": str(before), "after": str(after), "files": files},
                sort_keys=True,
            )
        )
        return 0
    env = os.environ.copy()
    env["NVIM_DIFF_BEFORE"] = str(before)
    env["NVIM_DIFF_AFTER"] = str(after)
    command = "lua vim.cmd({ cmd = 'CodeDiff', args = { 'dir', vim.env.NVIM_DIFF_BEFORE, vim.env.NVIM_DIFF_AFTER } })"
    return subprocess.call(["nvim", "-c", command], cwd=cwd, env=env)


def repository_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nvimdiv")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("paths", nargs="*")
    args = parser.parse_args(argv)
    cwd = Path.cwd()
    detected = repository(cwd)
    if not detected:
        print("nvimdiv: not inside a Git or Arc repository", file=sys.stderr)
        return 1
    vcs, root = detected
    try:
        paths = normalize_repository_paths(root, cwd, args.paths)
    except ValueError as error:
        print(f"nvimdiv: {error}", file=sys.stderr)
        return 2
    if vcs == "git":
        return launch_git(root, args.dry_run, paths)
    with tempfile.TemporaryDirectory(prefix="nvimdiv-") as temp:
        temp_root = Path(temp)
        before = temp_root / "before"
        after = temp_root / "after"
        before.mkdir()
        after.mkdir()
        try:
            files = arc_snapshots(root, before, after, paths)
        except (json.JSONDecodeError, OSError, RuntimeError) as error:
            print(f"nvimdiv: {error}", file=sys.stderr)
            return 1
        if not files:
            print("nvimdiv: no changes")
            return 0
        return launch_directories(before, after, root, args.dry_run, files)


def clean_patch(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace")
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)


def unquote_path(value: str) -> str | None:
    value = value.strip()
    if "\t" in value:
        value = value.split("\t", 1)[0]
    if value == "/dev/null":
        return None
    if value.startswith('"'):
        try:
            parsed = shlex.split(value)
            if parsed:
                value = parsed[0]
        except ValueError:
            value = value.strip('"')
    if value.startswith(("a/", "b/")):
        value = value[2:]
    return value


def parse_patch(text: str) -> list[PatchFile]:
    lines = text.splitlines()
    files = []
    current = None
    in_hunk = False
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.startswith("diff --git "):
            if current and current.changed:
                files.append(current)
            current = PatchFile()
            in_hunk = False
            try:
                tokens = shlex.split(line)
                current.old_path = unquote_path(tokens[-2])
                current.new_path = unquote_path(tokens[-1])
            except (ValueError, IndexError):
                pass
            index += 1
            continue
        if (
            line.startswith("--- ")
            and index + 1 < len(lines)
            and lines[index + 1].startswith("+++ ")
        ):
            if current is None:
                current = PatchFile()
            elif current.hunks > 0:
                if current.changed:
                    files.append(current)
                current = PatchFile()
            current.old_path = unquote_path(line[4:])
            current.new_path = unquote_path(lines[index + 1][4:])
            in_hunk = False
            index += 2
            continue
        if line.startswith("@@ "):
            if current is None:
                current = PatchFile(old_path="diff.txt", new_path="diff.txt")
            if current.hunks:
                current.old_lines.append("")
                current.new_lines.append("")
            current.hunks += 1
            in_hunk = True
            index += 1
            continue
        if line.startswith("@@@"):
            return []
        if in_hunk and current:
            if line.startswith("\\ No newline at end of file"):
                index += 1
                continue
            prefix = line[:1]
            content = line[1:] if prefix in {" ", "+", "-"} else line
            if prefix == " ":
                current.old_lines.append(content)
                current.new_lines.append(content)
            elif prefix == "-":
                current.old_lines.append(content)
                current.changed = True
            elif prefix == "+":
                current.new_lines.append(content)
                current.changed = True
            else:
                in_hunk = False
        index += 1
    if current and current.changed:
        files.append(current)
    return files


def parse_normal_diff(text: str) -> list[PatchFile]:
    header = re.compile(r"^\d+(?:,\d+)?[acd]\d+(?:,\d+)?$")
    lines = text.splitlines()
    old_lines = []
    new_lines = []
    changed = False
    hunks = 0
    for index, line in enumerate(lines):
        if not header.match(line):
            continue
        if hunks:
            old_lines.append("")
            new_lines.append("")
        hunks += 1
        cursor = index + 1
        while cursor < len(lines) and not header.match(lines[cursor]):
            value = lines[cursor]
            if value.startswith("< "):
                old_lines.append(value[2:])
                changed = True
            elif value.startswith("> "):
                new_lines.append(value[2:])
                changed = True
            cursor += 1
    if not changed:
        return []
    return [PatchFile("diff.txt", "diff.txt", old_lines, new_lines, hunks, True)]


def patch_snapshots(files: list[PatchFile], before: Path, after: Path) -> list[str]:
    paths = []
    used = set()
    for item in files:
        display = item.new_path or item.old_path or "diff.txt"
        relative = safe_path(display)
        base = relative
        suffix = 2
        while relative in used:
            relative = base.with_name(f"{base.stem}-{suffix}{base.suffix}")
            suffix += 1
        used.add(relative)
        paths.append(relative.as_posix())
        if item.old_path is not None:
            write_file(before, relative, ("\n".join(item.old_lines) + "\n").encode())
        if item.new_path is not None:
            write_file(after, relative, ("\n".join(item.new_lines) + "\n").encode())
    return paths


def raw_patch(text: str, dry_run: bool) -> int:
    if dry_run:
        print(json.dumps({"mode": "raw", "bytes": len(text.encode())}))
        return 0
    with tempfile.TemporaryDirectory(prefix="nvimd-") as temp:
        patch_file = Path(temp) / "input.diff"
        patch_file.write_text(text)
        return subprocess.call(
            ["nvim", "-R", str(patch_file), "-c", "setlocal filetype=diff"]
        )


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
            print("nvimd: pipe a unified diff or pass a patch file", file=sys.stderr)
            return 1
        data = sys.stdin.buffer.read()
    text = clean_patch(data)
    files = parse_patch(text)
    if not files:
        files = parse_normal_diff(text)
    if not files:
        return raw_patch(text, args.dry_run)
    with tempfile.TemporaryDirectory(prefix="nvimd-") as temp:
        temp_root = Path(temp)
        before = temp_root / "before"
        after = temp_root / "after"
        before.mkdir()
        after.mkdir()
        paths = patch_snapshots(files, before, after)
        return launch_directories(before, after, Path.cwd(), args.dry_run, paths)
