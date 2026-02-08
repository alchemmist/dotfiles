#!/bin/bash

windows=$(tmux list-windows -a -F '#S:#I:#W')

sleep 0.1
selected=$(echo "$windows" | fzf)

if [ -n "$selected" ]; then
    session=$(echo "$selected" | cut -d':' -f1)
    window_index=$(echo "$selected" | cut -d':' -f2)
    tmux switch-client -t "${session}:${window_index}"
fi
