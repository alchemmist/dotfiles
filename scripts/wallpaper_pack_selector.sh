#!/bin/bash

export WALLPAPERS_DIR="/home/alchemmist/Pictures/wallpapers"

packs=()
for dir in "$WALLPAPERS_DIR"/*; do
    if [ -d "$dir" ]; then
        packs+=("$(basename "$dir")")
    fi
done

selected_pack=$(printf "%s\n" "${packs[@]}" | fzf --prompt="Select wallpaper pack: ")

sed -i "s/^export WALLPAPER_PACK=.*/export WALLPAPER_PACK=${selected_pack}/" "/home/alchemmist/scripts/swww_random.sh"

exec "/home/alchemmist/scripts/swww_random.sh"






