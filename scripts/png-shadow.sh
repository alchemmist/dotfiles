#!/bin/bash

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    echo "Usage: $0 input_file output_file [shadow_factor]"
    exit 1
fi

input_file="$1"
output_file="$2"
factor="${3:-1}"

if command -v magick &>/dev/null; then
    IM_CMD="magick"
elif command -v convert &>/dev/null; then
    IM_CMD="convert"
else
    echo "Ошибка: ImageMagick не установлен! Установите его командой: sudo apt install imagemagick"
    exit 1
fi

# Вычисляем новые параметры с учетом коэффициента
blur_radius=$(awk "BEGIN {print 15 * $factor}")
shadow_size=$(awk "BEGIN {print 35 * $factor}")
extent_offset=$(awk "BEGIN {print 35 * $factor}")
extent_offset_rounded=$(printf "%.0f" "$extent_offset")

$IM_CMD "$input_file" \
  \( +clone -alpha extract -blur 0x$blur_radius -background black -shadow ${shadow_size}x${shadow_size}+0+0 \) \
  +swap -background none -layers merge -gravity center -extent "%[fx:w+$extent_offset_rounded]x%[fx:h+$extent_offset_rounded]" \
  "$output_file"
