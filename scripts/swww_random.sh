#!/bin/bash

export WALLPAPER_PACK=nature

DIR="/home/alchemmist/Pictures/wallpapers/$WALLPAPER_PACK"
CURRENT="/home/alchemmist/Pictures/wallpapers/current-wallpaper"

img=$(find "$DIR" -type f -o -type l | shuf -n1)

awww img "$img" \
  --transition-type any \
  --transition-fps 60 \
  --transition-step 90 \
  --transition-duration 1.2 \
  --transition-angle 40

ln -sf "$img" "$CURRENT"
