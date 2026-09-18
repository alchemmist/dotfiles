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

install_plugin https://github.com/and-rs/flash.tmux.git flash.tmux
install_plugin https://github.com/alchemmist/tmux-claude-usage.git tmux-claude-usage
if [ "$(uname -s)" = Darwin ] && ! command -v gawk >/dev/null 2>&1; then
    brew install gawk
fi

install_plugin https://github.com/tmux-plugins/tmux-copycat.git tmux-copycat

script_dir="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
copycat_patch="$script_dir/patches/tmux-copycat-two-screens.patch"
if ! git -C "$plugins_dir/tmux-copycat" apply --reverse --check "$copycat_patch" 2>/dev/null; then
    git -C "$plugins_dir/tmux-copycat" apply --check "$copycat_patch"
    git -C "$plugins_dir/tmux-copycat" apply "$copycat_patch"
fi

cp "$script_dir/tmux-copycat-fast.py" "$plugins_dir/tmux-copycat/scripts/tmux-copycat-fast.py"
copycat_fast_patch="$script_dir/patches/tmux-copycat-fast.patch"
if ! git -C "$plugins_dir/tmux-copycat" apply --reverse --check "$copycat_fast_patch" 2>/dev/null; then
    git -C "$plugins_dir/tmux-copycat" apply --check "$copycat_fast_patch"
    git -C "$plugins_dir/tmux-copycat" apply "$copycat_fast_patch"
fi
