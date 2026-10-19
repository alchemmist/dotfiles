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

script_dir="$(python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).resolve().parent)' "${BASH_SOURCE[0]}")"
flash_dir="$plugins_dir/flash.tmux"
flash_rebuild=0
if ! patch -d "$flash_dir" -p1 -R --dry-run -s < "$script_dir/tmux-flash-instant.patch" >/dev/null 2>&1; then
    patch -d "$flash_dir" -p1 --forward < "$script_dir/tmux-flash-instant.patch"
    flash_rebuild=1
fi
if ! patch -d "$flash_dir" -p1 -R --dry-run -s < "$script_dir/tmux-flash-visual.patch" >/dev/null 2>&1; then
    patch -d "$flash_dir" -p1 --forward < "$script_dir/tmux-flash-visual.patch"
    flash_rebuild=1
fi
if [ "$flash_rebuild" = 1 ] || [ ! -x "$flash_dir/zig-out/bin/flash_tmux_instant" ]; then
    if command -v zig >/dev/null 2>&1; then
        (cd "$flash_dir" && zig build -Doptimize=ReleaseFast)
    elif command -v uv >/dev/null 2>&1; then
        (cd "$flash_dir" && uv run --with ziglang==0.16.0 python -m ziglang build -Doptimize=ReleaseFast)
    else
        printf '%s\n' 'flash.tmux instant input requires Zig 0.16 or uv' >&2
        exit 1
    fi
    cp "$flash_dir/zig-out/bin/flash_tmux" "$flash_dir/zig-out/bin/flash_tmux_instant"
fi

install_plugin https://github.com/alchemmist/tmux-claude-usage.git tmux-claude-usage
if [ "$(uname -s)" = Darwin ] && ! command -v gawk >/dev/null 2>&1; then
    brew install gawk
fi

install_plugin https://github.com/alchemmist/tmux-copycat.git tmux-copycat main

cp "$(dirname "${BASH_SOURCE[0]}")/tmux-copycat-fast.py" "$plugins_dir/tmux-copycat/scripts/tmux-copycat-fast.py"
