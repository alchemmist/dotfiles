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

VIDEO_CODECS=$(ffprobe -v error -select_streams v -show_entries stream=codec_name -of csv=p=0 "$INPUT")
AUDIO_CODECS=$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$INPUT")
OPTIONS=(-c copy)
INDEX=0
while IFS= read -r CODEC; do
    if [ "$CODEC" = prores ]; then
        printf 'Video %s: ProRes -> lossless HEVC, preserving the pixel format. Encoding may be slow; player support varies.\n' "$INDEX"
        OPTIONS+=("-c:v:$INDEX" libx265 "-preset:v:$INDEX" fast "-x265-params:v:$INDEX" lossless=1 "-pix_fmt:v:$INDEX" + "-tag:v:$INDEX" hvc1 "-fps_mode:v:$INDEX" passthrough)
    fi
    INDEX=$((INDEX + 1))
done <<< "$VIDEO_CODECS"

INDEX=0
while IFS= read -r CODEC; do
    case "$CODEC" in
        pcm_s16le|pcm_s16be|pcm_s24le|pcm_s24be)
            printf 'Audio %s: PCM -> ALAC (lossless).\n' "$INDEX"
            OPTIONS+=("-c:a:$INDEX" alac)
            ;;
    esac
    INDEX=$((INDEX + 1))
done <<< "$AUDIO_CODECS"

TEMP_DIR=$(mktemp -d "${OUTPUT%/*}/.mov2mp4.XXXXXX")
trap 'rm -rf -- "$TEMP_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Copying video, audio, subtitles and cover art; omitting MOV data tracks (including timecode).\n'
ffmpeg -hide_banner -nostdin -n -i "$INPUT" -map 0:v -map '0:a?' -map '0:s?' "${OPTIONS[@]}" -write_tmcd 0 -movflags +faststart -f mp4 "$TEMP_DIR/output.mp4"
ln "$TEMP_DIR/output.mp4" "$OUTPUT"

printf 'MP4 saved without quality loss: %s\n' "$OUTPUT"
