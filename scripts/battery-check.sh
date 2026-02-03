#!/bin/bash

LOW_FLAG="/tmp/battery_low_notified"           #  15%
CRITICAL_FLAG="/tmp/battery_critical_notified" #  5%
FULL_FLAG="/tmp/battery_full_notified"         #  99%

BATTERY_LEVEL=$(cat /sys/class/power_supply/BATT/capacity)

BATTERY_STATUS=$(cat /sys/class/power_supply/BATT/status)

# ---------------------
# Check low battery level (15%)
# ---------------------
if [ "$BATTERY_STATUS" = "Discharging" ] && [ "$BATTERY_LEVEL" -le 15 ] && [ "$BATTERY_LEVEL" -gt 5 ]; then
    if [ ! -f "$LOW_FLAG" ]; then
        notify-send -u critical "🔌 Charging needed" "Battery: ${BATTERY_LEVEL}% 󰁺"
        touch "$LOW_FLAG"
    fi
else
    [ -f "$LOW_FLAG" ] && rm "$LOW_FLAG"
fi

# ---------------------
# Check cricical battery level (5%)
# ---------------------
if [ "$BATTERY_STATUS" = "Discharging" ] && [ "$BATTERY_LEVEL" -le 5 ]; then
    if [ ! -f "$CRITICAL_FLAG" ]; then
        notify-send -u critical "⚠️ Battery critically low" "Battery: ${BATTERY_LEVEL}% 󰂎"
        touch "$CRITICAL_FLAG"
    fi
else
    [ -f "$CRITICAL_FLAG" ] && rm "$CRITICAL_FLAG"
fi

# ---------------------
# Check full battery level (99%)
# ---------------------
if { [ "$BATTERY_STATUS" = "Charging" ] && [ "$BATTERY_LEVEL" -ge 85 ]; } ||
    [ "$BATTERY_STATUS" = "Full" ]; then
    if [ ! -f "$FULL_FLAG" ]; then
        notify-send -u normal "⚡ Battery full" "Battery: ${BATTERY_LEVEL}% 󰁹"
        touch "$FULL_FLAG"
    fi
else
    [ -f "$FULL_FLAG" ] && rm "$FULL_FLAG"
fi

exit 0
