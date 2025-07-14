#!/bin/bash

# Usage: ./speedup.sh <speed_factor> <input_file> <output_file>
# Example: ./speedup.sh 2.5 input.mp4 output_2.5x.mp4

SPEED=$1
INPUT=$2
OUTPUT=$3

# Check arguments
if [[ -z "$SPEED" || -z "$INPUT" || -z "$OUTPUT" ]]; then
    echo "Usage: $0 <speed_factor> <input_file> <output_file>"
    exit 1
fi

# Calculate inverse speed for video timing
VP=$(awk "BEGIN {print 1/$SPEED}")

# Audio tempo generator (ffmpeg only supports 0.5–2.0 per atempo)
generate_atempo() {
    local target=$1
    local chain=""

    while (( $(echo "$target > 2.0" | bc -l) )); do
        chain+="atempo=2.0,"
        target=$(awk "BEGIN {print $target / 2.0}")
    done

    while (( $(echo "$target < 0.5" | bc -l) )); do
        chain+="atempo=0.5,"
        target=$(awk "BEGIN {print $target / 0.5}")
    done

    chain+="atempo=$target"
    echo "$chain"
}

ATEMPO=$(generate_atempo "$SPEED")

# Run ffmpeg with video and audio speed adjustments
ffmpeg -i "$INPUT" -filter_complex "[0:v]setpts=${VP}*PTS[v];[0:a]$ATEMPO[a]" -map "[v]" -map "[a]" -y "$OUTPUT"
