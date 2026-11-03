#!/usr/bin/env python3

import fcntl
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def build_binary(binary: Path) -> None:
    root = Path(os.environ.get("ARCADIA_ROOT", "~/arcadia")).expanduser()
    yastore = root / "yastore"
    source = yastore / "mcp/kitsql/kitsql"
    ya = root / "ya"
    if not ya.is_file():
        ya = Path(shutil.which("ya") or "ya")
    lock_path = Path("~/.cache/antex/kitsql-build.lock").expanduser()
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        if binary.is_file():
            return
        if not source.is_file():
            result = subprocess.run(
                [str(ya), "make", "./mcp/kitsql"],
                cwd=yastore,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300,
                check=False,
            )
            if result.returncode:
                print(result.stderr[-4000:], file=sys.stderr, end="")
                raise SystemExit(result.returncode)
        if not source.is_file():
            raise SystemExit(f"KitSQL build completed without producing {source}")
        binary.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(dir=binary.parent, prefix=f".{binary.name}.")
        os.close(descriptor)
        try:
            shutil.copy2(source, temporary)
            os.chmod(temporary, 0o700)
            os.replace(temporary, binary)
        finally:
            Path(temporary).unlink(missing_ok=True)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("missing KitSQL binary path")
    binary = Path(sys.argv[1]).expanduser()
    if not binary.is_file():
        build_binary(binary)
    os.execvpe(str(binary), [str(binary), *sys.argv[2:]], os.environ)


if __name__ == "__main__":
    main()
