#!/usr/bin/env bash

set -euo pipefail

plugins_dir="${TMUX_PLUGIN_MANAGER_PATH:-$HOME/.tmux/plugins}"
mkdir -p "$plugins_dir"

install_plugin() {
    local repository="$1"
    local directory="$2"
    local branch="${3:-}"
    local clone_args=(--depth 1)
    if [ -n "$branch" ]; then
        clone_args+=(--branch "$branch")
    fi

    if [ ! -d "$plugins_dir/$directory/.git" ]; then
        git clone "${clone_args[@]}" "$repository" "$plugins_dir/$directory"
    fi
}

install_plugin https://github.com/and-rs/flash.tmux.git flash.tmux
install_plugin https://github.com/alchemmist/tmux-claude-usage.git tmux-claude-usage
if [ "$(uname -s)" = Darwin ] && ! command -v gawk >/dev/null 2>&1; then
    brew install gawk
fi

install_plugin https://github.com/alchemmist/tmux-copycat.git tmux-copycat main
