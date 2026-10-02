#!/bin/sh
set -eu
repo_root=$(git -C "$PWD" rev-parse --show-toplevel)
python3 "$repo_root/scripts/sync-agent-settings.py" render --root "$repo_root"
