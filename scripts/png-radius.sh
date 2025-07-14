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
  \( +clone -alpha extract \
     -draw "fill black polygon 0,0 0,%[fx:min(w,h)*0.02] %[fx:min(w,h)*0.02],0 fill white circle %[fx:min(w,h)*0.02],%[fx:min(w,h)*0.02] %[fx:min(w,h)*0.02],0" \
     \( +clone -flip \) -compose Multiply -composite \
     \( +clone -flop \) -compose Multiply -composite \
  \) \
  -alpha off -compose CopyOpacity -composite "$output_file"

