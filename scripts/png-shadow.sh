#!/bin/bash

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 input_file output_file"
    exit 1
fi

input_file="$1"
output_file="$2"

if command -v magick &>/dev/null; then
    IM_CMD="magick"
elif command -v convert &>/dev/null; then
    IM_CMD="convert"
else
    echo "Ошибка: ImageMagick не установлен! Установите его командой: sudo apt install imagemagick"
    exit 1
fi

$IM_CMD "$input_file" \
  \( +clone -alpha extract -blur 0x15 -background black -shadow 35x35+0+0 \) \
  +swap -background none -layers merge -gravity center -extent '%[fx:w+35]x%[fx:h+35]' \
  "$output_file"
