#!/usr/bin/env bash
prev=""
while true; do
    current=$(hyprctl devices -j | jq -r '.keyboards[] | select(.main==true) | .active_keymap')
    if [ "$current" != "$prev" ]; then
        pkill -SIGRTMIN+5 waybar
        prev="$current"
    fi
    sleep 0.5
done
