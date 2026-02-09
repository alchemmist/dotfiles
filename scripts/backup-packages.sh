#!/bin/sh
set -e

OUTDIR="packages"
PACMAN_FILE="$OUTDIR/pacman.txt"
YAY_FILE="$OUTDIR/yay.txt"

mkdir -p "$OUTDIR"

pacman -Qqe | sort > "$PACMAN_FILE"

if command -v yay >/dev/null 2>&1; then
    yay -Qqm | sort > "$YAY_FILE"
fi
