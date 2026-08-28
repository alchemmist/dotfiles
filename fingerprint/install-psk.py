#!/usr/bin/env python3
"""Recover and install a Goodix 5F10 PSK without writing to Windows."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path


def find_case_insensitive(root: Path, relative: str) -> Path | None:
    current = root
    for part in Path(relative).parts:
        if not current.is_dir():
            return None
        match = next((item for item in current.iterdir() if item.name.casefold() == part.casefold()), None)
        if match is None:
            return None
        current = match
    return current


def first_existing(root: Path, candidates: tuple[str, ...]) -> Path:
    for relative in candidates:
        path = find_case_insensitive(root, relative)
        if path is not None:
            return path
    raise FileNotFoundError(f"none of these paths exists below {root}: {', '.join(candidates)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--psk-tools-dir", required=True, type=Path)
    parser.add_argument("--windows-root", required=True, type=Path)
    args = parser.parse_args()

    if os.geteuid() != 0:
        parser.error("run through sudo; the installed PSK must be root-only")

    sys.path.insert(0, str(args.psk_tools_dir.resolve()))
    import goodix_psk  # type: ignore[import-not-found]
    import install_psk  # type: ignore[import-not-found]

    windows = args.windows_root.resolve()
    system = first_existing(windows, ("Windows/System32/config/SYSTEM",))
    security = first_existing(windows, ("Windows/System32/config/SECURITY",))
    cache = first_existing(
        windows,
        (
            "Windows/ServiceProfiles/LocalService/AppData/Local/Goodix/FingerPrint/Goodix_Cache.bin",
            "ProgramData/Goodix/Goodix_Cache.bin",
        ),
    )

    cache_data = cache.read_bytes()
    guid = goodix_psk.blob_masterkey_guid(cache_data).casefold()
    protect = first_existing(windows, ("Windows/System32/Microsoft/Protect",))
    masterkey = next(
        (path for path in protect.rglob("*") if path.is_file() and path.name.casefold() == guid),
        None,
    )
    if masterkey is None:
        raise FileNotFoundError(f"DPAPI master-key {guid} was not found below {protect}")

    # impacket opens registry hives r+b even for offline reads. Copy everything
    # to a private temporary directory so the Windows filesystem stays read-only.
    with tempfile.TemporaryDirectory(prefix="goodix-5f10-dpapi-") as temporary:
        local: dict[str, Path] = {}
        for label, source in {
            "SYSTEM": system,
            "SECURITY": security,
            "masterkey": masterkey,
            "cache": cache,
        }.items():
            destination = Path(temporary, label)
            shutil.copyfile(source, destination)
            destination.chmod(0o600)
            local[label] = destination

        result = goodix_psk.extract_psk(
            str(local["SYSTEM"]),
            str(local["SECURITY"]),
            str(local["masterkey"]),
            str(local["cache"]),
        )
        psk = result["psk"]
        if len(psk) != install_psk.PSK_LEN:
            raise RuntimeError(f"unexpected PSK size: {len(psk)}")
        install_psk._atomic_install(install_psk.DEFAULT_DEST, psk)

    print(
        f"Installed {install_psk.DEFAULT_DEST} (32 bytes, mode 0600); "
        "the PSK value was not printed."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
