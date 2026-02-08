#!/bin/bash

CONFIG="$HOME/.config/alacritty/alacritty.toml"
DARK="~/.config/alacritty/themes/moss-dark.toml"
LIGHT="~/.config/alacritty/themes/moss-light.toml"

if grep -q "^[[:space:]]*\"$DARK\"" "$CONFIG"; then
    sed -i -E \
        "s|^[[:space:]]*\"$DARK\"|# \"$DARK\"|; s|^[[:space:]]*# \"$LIGHT\"|\"$LIGHT\"|" \
        "$CONFIG"
else
    sed -i -E \
        "s|^[[:space:]]*# \"$DARK\"|\"$DARK\"|; s|^[[:space:]]*\"$LIGHT\"|# \"$LIGHT\"|" \
        "$CONFIG"
fi

theme=$(tmux show -gv @theme)
if [ "$theme" = "dark" ]; then
  tmux set -g @theme "light"

  tmux set -g window-status-current-style "fg=#6aa84f,bg=default,bold"
  tmux set -g window-status-last-style "fg=#8fce72,bg=default,none"

else
  tmux set -g @theme "dark"

  tmux set -g window-status-current-style "fg=#8fce72,bg=default,bold"
  tmux set -g window-status-last-style "fg=#6aa84f,bg=default,none"
fi

