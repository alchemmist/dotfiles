#!/bin/bash

# Порог батареи (%)
THRESHOLD=10

# Проверка каждые 60 секунд
while true; do
    # Читаем уровень батареи
    BATTERY=$(cat /sys/class/power_supply/BATT/capacity)

    if [ "$BATTERY" -le "$THRESHOLD" ]; then
        echo "Battery is $BATTERY%, shutting down..."
        sudo shutdown -h now
        exit 0
    fi

    sleep 60
done
