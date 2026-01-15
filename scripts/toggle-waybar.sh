#!/usr/bin/env bash
set -u

WAYBAR_CMD='waybar --config /home/alchemmist/.config/waybar/hypr-config.json --style /home/alchemmist/.config/waybar/hypr-style.css'

has_waybar() {
    pgrep -x waybar >/dev/null 2>&1
}

start_waybar() {
    hyprctl keyword general:gaps_out "8, 15, 15, 15" >/dev/null 2>&1 || true
    setsid bash -c "$WAYBAR_CMD" >/dev/null 2>&1 &
}

stop_waybar() {
    pkill -x waybar >/dev/null 2>&1 || true
    hyprctl keyword general:gaps_out "15, 15, 15, 15" >/dev/null 2>&1 || true
}

if has_waybar; then
    stop_waybar
else
    start_waybar
fi
