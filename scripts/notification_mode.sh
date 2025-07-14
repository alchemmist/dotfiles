#!/bin/bash

# Путь к файлу состояния
STATE_FILE="$HOME/.config/mako/mako_state"

# Инициализация файла состояния
if [[ ! -f "$STATE_FILE" ]]; then
    echo "on" > "$STATE_FILE"
fi

# Чтение текущего состояния
STATE=$(cat "$STATE_FILE")

# Управление состоянием
case "$1" in
    toggle)
        if [[ "$STATE" == "on" ]]; then
            echo "off" > "$STATE_FILE"
            makoctl mode -s hide
        else
            echo "on" > "$STATE_FILE"
            makoctl mode -r hide
        fi
        ;;
    status)
        if [[ "$STATE" == "on" ]]; then
            echo '{"tooltip": "Notification on", "class": "on", "alt": "on"}' 
        else
            echo '{"tooltip": "Notification disbaled", "class": "off", "alt": "off"}'  
        fi
        ;;
    *)
        echo "Usage: $0 {toggle|status}"
        exit 1
        ;;
esac

