#!/usr/bin/env bash

set -euo pipefail

plugins_dir="${TMUX_PLUGIN_MANAGER_PATH:-$HOME/.tmux/plugins}"
mkdir -p "$plugins_dir"

install_plugin() {
    local repository="$1"
    local directory="$2"

    if [ ! -d "$plugins_dir/$directory/.git" ]; then
        git clone --depth 1 "$repository" "$plugins_dir/$directory"
    fi
}

install_plugin https://github.com/alchemmist/tmux-flash.git tmux-flash
install_plugin https://github.com/alchemmist/tmux-claude-usage.git tmux-claude-usage
