#!/bin/bash

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    echo "Usage: $0 input_file output_file [radius_factor]"
    echo "Example: $0 input.png output.png 1.5"
    exit 1
fi

input_file="$1"
output_file="$2"
radius_factor=1.0

if [ "$#" -eq 3 ]; then
    if [[ ! "$3" =~ ^[0-9]+(\.[0-9]+)?$ ]] || (( $(echo "$3 <= 0" | bc -l) )); then
        echo "Ошибка: коэффициент должен быть положительным числом."
        exit 1
    fi
    radius_factor="$3"
fi

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
     -draw "fill black polygon 0,0 0,%[fx:min(w,h)*0.02*$radius_factor] %[fx:min(w,h)*0.02*$radius_factor],0 fill white circle %[fx:min(w,h)*0.02*$radius_factor],%[fx:min(w,h)*0.02*$radius_factor] %[fx:min(w,h)*0.02*$radius_factor],0" \
     \( +clone -flip \) -compose Multiply -composite \
     \( +clone -flop \) -compose Multiply -composite \
  \) \
  -alpha off -compose CopyOpacity -composite "$output_file"
