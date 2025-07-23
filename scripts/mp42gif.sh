#!/bin/bash

# Usage: mp42gif input.mp4 output.gif

set -e  # Exit on error

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 input.mp4 output.gif"
    exit 1
fi

INPUT="$1"
OUTPUT="$2"
PALETTE="_tmp_palette.png"

# Generate palette
ffmpeg -y -i "$INPUT" -vf "fps=15,scale=iw:-1:flags=lanczos,palettegen" "$PALETTE"

# Create GIF using the palette
ffmpeg -y -i "$INPUT" -i "$PALETTE" -lavfi "fps=15,scale=iw:-1:flags=lanczos [x]; [x][1:v] paletteuse" "$OUTPUT"

# Cleanup
rm -f "$PALETTE"

echo "✅ GIF saved to $OUTPUT"

