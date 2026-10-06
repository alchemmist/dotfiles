#!/bin/sh
set -eu
repo_root=$(git -C "$PWD" rev-parse --show-toplevel)
mkdir -p "$repo_root/.dotter/cache"
chmod 700 "$repo_root/.dotter/cache"
python3 "$repo_root/scripts/sync-agent-settings.py" render --root "$repo_root"
if [ "$(uname -s)" = Darwin ]; then
    /usr/bin/python3 "$repo_root/scripts/deploy-macos.py" render
fi
