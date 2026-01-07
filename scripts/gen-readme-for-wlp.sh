#!/bin/bash

set -e

# Используем переменную окружения REPO_ROOT
if [ -z "$REPO_ROOT" ]; then
    echo "Ошибка: REPO_ROOT не установлен"
    exit 1
fi

echo "" > "README.md"

current_dir_name=$(basename "$(pwd)")

radius_script="$REPO_ROOT/scripts/png-radius.sh"
shadow_script="$REPO_ROOT/scripts/png-shadow.sh"
preview_dir="$REPO_ROOT/media/wlp-preview/$current_dir_name"

images_dir="./images"

if [ ! -f "$radius_script" ]; then
    echo "Ошибка: Скрипт png-radius.sh не найден! ($radius_script)"
    exit 1
fi

if [ ! -f "$shadow_script" ]; then
    echo "Ошибка: Скрипт png-shadow.sh не найден! ($shadow_script)"
    exit 1
fi

if command -v magick &>/dev/null; then
    IM_CMD="magick"
elif command -v convert &>/dev/null; then
    IM_CMD="convert"
else
    echo "Ошибка: ImageMagick не установлен!"
    exit 1
fi

if [ ! -d "$images_dir" ]; then
    echo "Ошибка: директория 'images/' не найдена!"
    exit 1
fi

mkdir -p "$preview_dir"

shopt -s nullglob
image_files=("$images_dir"/*.{jpg,jpeg,png,webp,gif,bmp,tiff})
if [ ${#image_files[@]} -eq 0 ]; then
    echo "Ошибка: В папке 'images/' нет файлов изображений!"
    exit 1
fi

echo "Найдено ${#image_files[@]} файлов изображений для обработки"
echo "Используем REPO_ROOT: $REPO_ROOT"
echo "Директория превью: $preview_dir"

for input_file in "${image_files[@]}"; do
    echo "Обработка: $input_file"

    filename=$(basename "$input_file")
    filename_without_extension="${filename%.*}"

    temp_resized=$(mktemp --suffix=.png)
    temp_radius=$(mktemp --suffix=.png)

    $IM_CMD "$input_file" -resize 500x -quality 40 -strip "$temp_resized"

    "$radius_script" "$temp_resized" "$temp_radius" 2

    output_file="$preview_dir/$filename_without_extension.png"
    "$shadow_script" "$temp_radius" "$output_file"

    {
        echo "[images/$filename](https://github.com/alchemmist/dotfiles/blob/main/wallpapers/$current_dir_name/images/$filename)<br>"
        echo "<img src=\"/media/wlp-preview/$current_dir_name/$filename_without_extension.png\" width=\"500\">"
        echo ""
    } >>"README.md"

    rm -f "$temp_resized" "$temp_radius"
done

echo "Готово! Обработано ${#image_files[@]} изображений."
echo "Оптимизированные превью сохранены в: $preview_dir"
echo "Записи добавлены в README.md"
