#!/bin/bash

set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
    printf 'Usage: mov2mp4 input.mov [output.mp4]\n' >&2
    exit 1
fi

INPUT="$1"
OUTPUT="${2:-${INPUT%.*}.mp4}"

if [ ! -f "$INPUT" ]; then
    printf 'Input file not found: %s\n' "$INPUT" >&2
    exit 1
fi

case "$OUTPUT" in
    /*|./*|../*) ;;
    *) OUTPUT="./$OUTPUT" ;;
esac

if [ -e "$OUTPUT" ] || [ -L "$OUTPUT" ]; then
    printf 'Output already exists: %s\n' "$OUTPUT" >&2
    exit 1
fi

ffmpeg -nostdin -n -i "$INPUT" -map 0 -c copy -movflags +faststart -f mp4 "$OUTPUT"

printf 'MP4 saved without re-encoding: %s\n' "$OUTPUT"
