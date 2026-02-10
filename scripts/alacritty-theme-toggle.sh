#!/bin/bash

CONFIG="$HOME/.config/alacritty/alacritty.toml"
DARK="~/.config/alacritty/themes/moss-dark.toml"
LIGHT="~/.config/alacritty/themes/moss-light.toml"

send_nvim() {
    local cmd="$1"
    shopt -s nullglob
    local sockets=("$XDG_RUNTIME_DIR"/nvim.*)
    shopt -u nullglob

    for s in "${sockets[@]}"; do
        nvim --server "$s" --remote-send "<Esc>:${cmd}<CR>" >/dev/null 2>&1
    done
}

if grep -q "^[[:space:]]*\"$DARK\"" "$CONFIG"; then
    sed -i -E \
        "s|^[[:space:]]*\"$DARK\"|# \"$DARK\"|; s|^[[:space:]]*# \"$LIGHT\"|\"$LIGHT\"|" \
        "$CONFIG"

    tmux set -g @theme "light"
    tmux set -g window-status-current-style "fg=#6aa84f,bg=default,bold"
    tmux set -g window-status-last-style "fg=#8fce72,bg=default,none"

    send_nvim "MossLight"
else
    sed -i -E \
        "s|^[[:space:]]*# \"$DARK\"|\"$DARK\"|; s|^[[:space:]]*\"$LIGHT\"|# \"$LIGHT\"|" \
        "$CONFIG"

    tmux set -g @theme "dark"
    tmux set -g window-status-current-style "fg=#8fce72,bg=default,bold"
    tmux set -g window-status-last-style "fg=#6aa84f,bg=default,none"

    send_nvim "MossDark"
fi
