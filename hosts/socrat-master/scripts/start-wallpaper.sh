#!/bin/sh
awww-daemon --format xrgb &
i=0
while ! awww query >/dev/null 2>&1; do
    i=$((i+1))
    [ "$i" -ge 30 ] && exit 1
    sleep 0.2
done
image="$HOME/Pictures/wallpapers/custom/images/frame-50.png"
awww img "$image"
ln -sfn "$image" "$HOME/Pictures/wallpapers/current-wallpaper"
