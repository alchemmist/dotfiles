#!/usr/bin/env python3
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import time

BASE = Path(__file__).resolve().parent
AGENTS = (".antex", ".codex", ".claude")
VOLATILE = {".tmp", "tmp", "log", "logs", "traces", "__pycache__", "node_modules"}
RUNTIME = {"SingletonCookie", "SingletonLock", "SingletonSocket", ".index.lock", "LOCK", ".session-locks", "app-server-daemon", "app-server-control", "thread-writer-locks", "mcp-oauth-locks", "proxy"}


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout.strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    path.chmod(0o600)


def relative(path, home):
    return str(Path(path).expanduser().absolute().relative_to(home))


def safe_name(name):
    path = PurePosixPath(name)
    if not name or not path.parts or path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError("Unsafe archive path: " + name)
    return path


def sqlite_copy(source, destination):
    deadline = time.monotonic() + 180

    def progress(status, remaining, total):
        if time.monotonic() > deadline:
            raise TimeoutError("SQLite backup deadline exceeded: " + source.name)

    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=5) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst, pages=2048, progress=progress, sleep=0.05)
            if dst.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise ValueError("SQLite integrity check failed: " + source.name)
    destination.chmod(0o600)


class Reader:
    def __init__(self, stream, size):
        self.stream = stream
        self.remaining = size
        self.sha = hashlib.sha256()

    def read(self, size=-1):
        amount = self.remaining if size < 0 else min(size, self.remaining)
        data = self.stream.read(amount)
        self.remaining -= len(data)
        self.sha.update(data)
        return data


def jsonl_size(stream, size):
    position = size
    while position:
        start = max(0, position - 65536)
        stream.seek(start)
        chunk = stream.read(position - start)
        index = chunk.rfind(b"\n")
        if index >= 0:
            return start + index + 1
        position = start
    return 0


def archive_tree(home, source, logical, tar, records, excluded, work, ancestors=()):
    resolved = source.resolve()
    if resolved == home / "arcadia" or any(
        resolved.is_relative_to(home / name) for name in ("arcadia", "arcadia-wt", "arcadia-worktrees")
    ):
        excluded.append({"path": logical, "reason": "external Arc working copy"})
        return
    if not resolved.is_relative_to(home):
        excluded.append({"path": logical, "reason": "symlink outside source home"})
        return
    try:
        info = source.stat()
    except FileNotFoundError:
        excluded.append({"path": logical, "reason": "missing or dangling link"})
        return
    identity = (info.st_dev, info.st_ino)
    if stat.S_ISDIR(info.st_mode):
        if identity in ancestors:
            raise ValueError("Directory symlink cycle: " + logical)
        member = tarfile.TarInfo(logical)
        member.type = tarfile.DIRTYPE
        member.mode = 0o700
        tar.addfile(member)
        for item in sorted(source.iterdir()):
            name = item.name
            if name in VOLATILE or name in RUNTIME or name.endswith(("-wal", "-shm", ".sock", ".pid", ".lock")) or name.startswith("logs_"):
                excluded.append({"path": logical + "/" + name, "reason": "runtime, diagnostics, or SQLite sidecar"})
                continue
            archive_tree(home, item, logical + "/" + name, tar, records, excluded, work, ancestors + (identity,))
        return
    if not stat.S_ISREG(info.st_mode):
        excluded.append({"path": logical, "reason": "socket or special file"})
        return
    with source.open("rb") as probe:
        is_sqlite = probe.read(16) == b"SQLite format 3\x00"
    temporary = None
    read_from = source
    if is_sqlite:
        temporary = work / (hashlib.sha256(logical.encode()).hexdigest() + ".sqlite")
        sqlite_copy(resolved, temporary)
        read_from = temporary
    with read_from.open("rb") as stream:
        current = os.fstat(stream.fileno())
        size = current.st_size
        if source.suffix == ".jsonl":
            size = jsonl_size(stream, size)
        stream.seek(0)
        reader = Reader(stream, size)
        member = tarfile.TarInfo(logical)
        member.size = size
        member.mode = 0o700 if current.st_mode & 0o111 else 0o600
        member.mtime = int(current.st_mtime)
        tar.addfile(member, reader)
        if reader.remaining:
            raise ValueError("Source shrank while reading: " + logical)
        records.append({"path": logical, "bytes": size, "sha256": reader.sha.hexdigest(), "sqlite": is_sqlite})
    if temporary:
        temporary.unlink()


def snapshot_report(root, source_home, lazy_relative):
    home = Path(source_home)
    report = {"sessions": [], "agent_panes": [], "missing_workdirs": [], "thread_counts": {}, "missing_rollouts": []}
    indexes = {}
    for agent in AGENTS[:2]:
        db_path = root / agent / "state_5.sqlite"
        indexes[agent] = {}
        if db_path.exists():
            with sqlite3.connect(db_path.as_uri() + "?mode=ro", uri=True) as db:
                if db.execute("SELECT 1 FROM sqlite_master WHERE name='threads'").fetchone():
                    for identity, rollout, cwd in db.execute("SELECT id, rollout_path, cwd FROM threads"):
                        indexes[agent][identity] = rollout
                        try:
                            present = (root / Path(rollout).relative_to(home)).is_file()
                        except ValueError:
                            present = False
                        if not present:
                            report["missing_rollouts"].append({"agent": agent, "id": identity, "path": rollout})
            report["thread_counts"][agent] = len(indexes[agent])
    workdirs = set()
    for path in sorted((root / lazy_relative / "sessions").glob("*.json")):
        state = json.loads(path.read_text())
        report["sessions"].append(state["session_name"])
        for window in state.get("windows", []):
            for pane in window.get("panes", []):
                cwd = pane.get("current_path", "")
                if cwd:
                    workdirs.add(cwd)
                meta = pane.get("meta", {})
                value = pane.get("agent") or {}
                kind = value.get("kind")
                if not kind:
                    command = pane.get("current_cmd", "")
                    kind = command if command in ("antex", "codex", "claude") else None
                if not kind:
                    continue
                identity = value.get("id") or meta.get(kind + ".session_id")
                source = value.get("source") or meta.get(kind + ".session_id_source")
                ids = set(re.findall(r"[0-9a-f]{8}-[0-9a-f-]{27}", pane.get("restore_cmd", "")))
                if identity:
                    ids.add(identity)
                agent_home = value.get("home") or meta.get(kind + ".home") or str(home / ("." + kind))
                try:
                    agent_relative = str(Path(agent_home).relative_to(home))
                except ValueError:
                    agent_relative = ""
                exists = identity in indexes.get(agent_relative, {})
                if exists:
                    rollout = indexes[agent_relative][identity]
                    exists = (root / Path(rollout).relative_to(home)).is_file()
                try:
                    argv = value.get("argv") or json.loads(meta.get(kind + ".resume_argv", "[]"))
                except (ValueError, TypeError):
                    argv = []
                expected_command = "--resume" if kind == "claude" else "resume"
                valid_argv = isinstance(argv, list) and len(argv) >= 3 and Path(argv[0]).name == kind and argv[1:3] == [expected_command, identity]
                report["agent_panes"].append({
                    "session": state["session_name"], "window": window["index"], "pane": pane["index"],
                    "kind": kind, "id": identity, "source": source, "home": agent_home,
                    "candidate_ids": sorted(ids), "candidate_history_present": {candidate: any(candidate in values for values in indexes.values()) for candidate in sorted(ids)}, "history_present": exists,
                    "verified_binding": source in ("binding-v1", "hook-v1", "manual-v1") and exists and len(ids) <= 1 and valid_argv,
                })
    report["workdirs"] = sorted(workdirs)
    report["missing_workdirs"] = [path for path in sorted(workdirs) if not Path(path).is_dir()]
    return report


def backup(args):
    home = Path.home().resolve()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    bundle = (args.output or BASE / "archives" / stamp).absolute()
    if bundle.exists():
        raise ValueError("Bundle already exists")
    bundle.mkdir(parents=True, mode=0o700)
    os.chmod(bundle.parent, 0o700)
    manifest = {"format": 1, "created_at": stamp, "source_home": str(home), "platform": platform.platform(), "machine": platform.machine(), "archives": [], "excluded": [], "live_snapshot": True}
    cfg = run(["lazy-tmux", "config", "show"])
    import tomllib
    data_dir = Path(tomllib.loads(cfg)["data_dir"]).expanduser()
    lazy_relative = relative(data_dir, home)
    manifest["lazy_relative"] = lazy_relative
    launcher = home / ".local/bin/antex"
    manifest["launchers"] = {}
    if launcher.is_symlink():
        manifest["launchers"][".local/bin/antex"] = relative(launcher.resolve(), home)
    manifest["versions"] = {name: run([name, "version" if name == "lazy-tmux" else "--version"]) for name in ("lazy-tmux", "antex")}
    roots = [lazy_relative, ".local/share/lazy-tmux-backups", *AGENTS, ".claude.json", ".config/lazy-tmux", ".tmux.conf", ".tmux", ".local/bin/lazy-tmux", ".local/bin/antex"]
    with tempfile.TemporaryDirectory(prefix="migration-work-", dir=bundle) as work_dir:
        work = Path(work_dir)
        staged_lazy = work / "home" / lazy_relative
        staged_lazy.parent.mkdir(parents=True)
        shutil.copytree(data_dir, staged_lazy)
        save_output = run(["lazy-tmux", "save", "--all", "--scrollback", "--scrollback-lines", "50000", "--data-dir", str(staged_lazy)])
        manifest["save_result"] = save_output
        print(save_output, flush=True)
        active = subprocess.run(["tmux", "list-sessions", "-F", "#{session_name}"], capture_output=True, text=True)
        manifest["running_sessions"] = active.stdout.strip().splitlines() if active.returncode == 0 else []
        for index, name in enumerate(roots):
            source = home / name
            if name == lazy_relative:
                source = staged_lazy
            if not source.exists():
                manifest["excluded"].append({"path": name, "reason": "not present"})
                continue
            filename = f"{index:02d}-{Path(name).name.lstrip('.')}.tar.gz"
            partial = bundle / (filename + ".partial")
            records = []
            print("Archiving " + name, flush=True)
            with tarfile.open(partial, "w:gz", compresslevel=1) as tar:
                archive_tree(home, source, name, tar, records, manifest["excluded"], work)
            final = bundle / filename
            partial.rename(final)
            final.chmod(0o600)
            entry = {"file": filename, "root": name, "sha256": digest(final), "bytes": final.stat().st_size, "files": records}
            manifest["archives"].append(entry)
            save_json(bundle / "manifest.partial.json", manifest)
            print(f"Saved {filename}: {len(records)} files, {final.stat().st_size // 1048576} MiB", flush=True)
    save_json(bundle / "manifest.json", manifest)
    (bundle / "manifest.partial.json").unlink()
    print("Bundle ready: " + str(bundle), flush=True)
    return bundle


def load_bundle(bundle):
    manifest = json.loads((bundle / "manifest.json").read_text())
    if manifest.get("format") != 1:
        raise ValueError("Unsupported bundle format")
    roots = [safe_name(entry["root"]) for entry in manifest["archives"]]
    for index, root in enumerate(roots):
        if any(root.is_relative_to(other) or other.is_relative_to(root) for other in roots[:index]):
            raise ValueError("Overlapping archive roots")
    for entry in manifest["archives"]:
        if Path(entry["file"]).name != entry["file"]:
            raise ValueError("Unsafe archive filename")
        if digest(bundle / entry["file"]) != entry["sha256"]:
            raise ValueError("Archive checksum mismatch: " + entry["file"])
    return manifest


def unpack(bundle, destination, manifest):
    destination.mkdir(parents=True, mode=0o700, exist_ok=True)
    for entry in manifest["archives"]:
        expected = {item["path"]: item for item in entry["files"]}
        seen = set()
        with tarfile.open(bundle / entry["file"], "r:gz") as tar:
            for member in tar:
                path = safe_name(member.name)
                if not path.is_relative_to(PurePosixPath(entry["root"])):
                    raise ValueError("Archive entry outside declared root")
                target = destination.joinpath(*path.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True, mode=0o700)
                    continue
                if not member.isfile() or member.name not in expected or member.name in seen:
                    raise ValueError("Unexpected archive member")
                if member.size != expected[member.name]["bytes"]:
                    raise ValueError("Archive member size mismatch")
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with tar.extractfile(member) as src, target.open("xb") as dst:
                    shutil.copyfileobj(src, dst, 1024 * 1024)
                target.chmod(member.mode & 0o700)
                if digest(target) != expected[member.name]["sha256"]:
                    raise ValueError("File checksum mismatch: " + member.name)
                if expected[member.name]["sqlite"]:
                    with sqlite3.connect(target.as_uri() + "?mode=ro", uri=True) as db:
                        if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                            raise ValueError("Restored SQLite integrity failure")
                seen.add(member.name)
        if seen != set(expected):
            raise ValueError("Archive is missing files")
        print("Verified " + entry["file"], flush=True)



def finalize_launchers(destination, manifest):
    for name, target_name in manifest.get("launchers", {}).items():
        safe_name(name)
        safe_name(target_name)
        if name != ".local/bin/antex" or not PurePosixPath(target_name).is_relative_to(PurePosixPath(".antex/packages")):
            raise ValueError("Unexpected launcher target")
        launcher = destination / name
        target = destination / target_name
        if not launcher.is_file() or not target.is_file():
            raise ValueError("Bundled Antex package is incomplete")
        if digest(launcher) != digest(target):
            raise ValueError("Launcher and package binary differ")
        launcher.unlink()
        launcher.symlink_to(os.path.relpath(target, launcher.parent))


def restore(args):
    bundle = args.bundle.resolve()
    manifest = load_bundle(bundle)
    if args.into:
        destination = args.into.absolute()
        if destination.exists():
            raise ValueError("Rehearsal destination must not exist")
        unpack(bundle, destination, manifest)
        finalize_launchers(destination, manifest)
        report = snapshot_report(destination, manifest["source_home"], manifest["lazy_relative"])
        save_json(bundle / "verification.json", report)
        print("Rehearsal complete: " + str(destination))
        return
    home = Path.home().resolve()
    if str(home) != manifest["source_home"]:
        raise ValueError("Restore requires the same home path as the source Mac: " + manifest["source_home"])
    if platform.machine() != manifest["machine"]:
        raise ValueError("Bundled binaries require architecture " + manifest["machine"])
    if not args.apply:
        print("Verified archives. Run restore with --apply to install into " + str(home))
        return
    commands = run(["ps", "-axo", "comm="]).splitlines()
    if any(Path(cmd.strip()).name in ("antex", "codex", "claude", "tmux", "antex-code-mode-host") or Path(cmd.strip()).name.startswith("tmux:") for cmd in commands):
        raise ValueError("Close agents and stop tmux before installing their state")
    roots = [home / entry["root"] for entry in manifest["archives"]]
    if not args.replace and any(p.exists() or p.is_symlink() for p in roots):
        raise ValueError("Destinations exist; --replace preserves them in a rollback directory before replacement")
    with tempfile.TemporaryDirectory(prefix=".session-migration-", dir=home) as staging:
        staging = Path(staging)
        unpack(bundle, staging, manifest)
        finalize_launchers(staging, manifest)
        rollback = home / (".session-migration-rollback-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
        rollback.mkdir(mode=0o700)
        installed = []
        moved = []
        try:
            for entry in manifest["archives"]:
                name = entry["root"]
                destination = home / name
                for parent in destination.parents:
                    if parent == home:
                        break
                    if parent.is_symlink():
                        raise ValueError("Destination parent is a symlink: " + str(parent))
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists() or destination.is_symlink():
                    old = rollback / name
                    old.parent.mkdir(parents=True, exist_ok=True)
                    destination.rename(old)
                    moved.append((old, destination))
                (staging / name).rename(destination)
                installed.append(destination)
        except BaseException:
            for destination in reversed(installed):
                if destination.is_dir() and not destination.is_symlink():
                    shutil.rmtree(destination)
                else:
                    destination.unlink()
            for old, destination in reversed(moved):
                old.rename(destination)
            raise
        print("State installed. Previous state retained at " + str(rollback))
        print("Next: lazy-tmux list; lazy-tmux restore --session SESSION --switch=false")



def restore_sessions(args):
    manifest = load_bundle(args.bundle.resolve())
    home = Path.home().resolve()
    if str(home) != manifest["source_home"]:
        raise ValueError("Session paths require the original home: " + manifest["source_home"])
    report = snapshot_report(home, str(home), manifest["lazy_relative"])
    names = report["sessions"] if args.all else [args.session]
    unknown = set(names) - set(report["sessions"])
    if unknown:
        raise ValueError("Unknown saved session: " + ", ".join(sorted(unknown)))
    current = subprocess.run(["tmux", "list-sessions", "-F", "#{session_name}"], capture_output=True, text=True)
    existing = set(current.stdout.splitlines()) if current.returncode == 0 else set()
    failures = []
    for name in names:
        if name in existing:
            print("Already running: " + name, flush=True)
            continue
        blockers = [row for row in report["agent_panes"] if row["session"] == name and not row["verified_binding"]]
        snapshots = home / manifest["lazy_relative"] / "sessions"
        state = next(json.loads(path.read_text()) for path in snapshots.glob("*.json") if json.loads(path.read_text())["session_name"] == name)
        absent = sorted({pane["current_path"] for window in state["windows"] for pane in window["panes"] if pane.get("current_path") and not Path(pane["current_path"]).is_dir()})
        if blockers or absent:
            print(f"Not started: {name}; unverified agent panes={len(blockers)}, missing workdirs={len(absent)}", flush=True)
            failures.append(name)
            continue
        command = [str(home / ".local/bin/lazy-tmux"), "restore", "--session", name, "--switch=false", "--data-dir", str(home / manifest["lazy_relative"])]
        subprocess.run(command, check=True)
        print("Restored: " + name, flush=True)
    if failures:
        raise ValueError("Some sessions need manual review; see verification.json: " + ", ".join(failures))


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    capture = commands.add_parser("backup")
    capture.add_argument("--output", type=Path)
    install = commands.add_parser("restore")
    install.add_argument("bundle", type=Path)
    install.add_argument("--into", type=Path)
    install.add_argument("--apply", action="store_true")
    install.add_argument("--replace", action="store_true")
    launch = commands.add_parser("restore-sessions")
    launch.add_argument("bundle", type=Path)
    selection = launch.add_mutually_exclusive_group(required=True)
    selection.add_argument("--all", action="store_true")
    selection.add_argument("--session")
    args = parser.parse_args()
    if args.command == "backup":
        backup(args)
    elif args.command == "restore":
        restore(args)
    else:
        restore_sessions(args)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, sqlite3.Error, subprocess.CalledProcessError) as error:
        print("Migration failed: " + str(error), file=sys.stderr)
        sys.exit(1)
