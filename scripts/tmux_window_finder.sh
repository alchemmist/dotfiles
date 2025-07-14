#!/bin/bash

# Получаем список всех окон во всех сессиях
windows=$(tmux list-windows -a -F '#S:#I:#W')

# Выводим список в fzf для выбора
sleep 0.1
selected=$(echo "$windows" | fzf)

# Если что-то выбрано, переключаемся на соответствующее окно
if [ -n "$selected" ]; then
    session=$(echo "$selected" | cut -d':' -f1)
    window_index=$(echo "$selected" | cut -d':' -f2)
    tmux switch-client -t "${session}:${window_index}"
fi
