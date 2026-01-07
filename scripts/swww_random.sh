#!/bin/bash

export SWWW_TRANSITION_FPS=60
export SWWW_TRANSITION=any
export SWWW_TRANSITION_DURATION=1.2
export SWWW_TRANSITION_ANGLE=40
export WALLPAPER_PACK=nature

DIR="/home/alchemmist/Pictures/wallpapers/$WALLPAPER_PACK"
CURRENT="/home/alchemmist/Pictures/wallpapers/current-wallpaper"

img=$(find "$DIR" -type f -o -type l | shuf -n1)

swww img "$img"

ln -sf "$img" "$CURRENT"
