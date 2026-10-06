#!/bin/zsh -f
set -euo pipefail
umask 077

mount_path="$HOME/arcadia"
export PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin

mount_status=$(/usr/local/bin/arc mount --list --json | /usr/bin/python3 -c '
import json
import sys

entries = [entry for entry in json.load(sys.stdin) if entry.get("mount") == sys.argv[1]]
if len(entries) != 1 or entries[0].get("tenant") != "arcadia":
    raise SystemExit("Expected an existing Arcadia mount registration")
print(entries[0]["status"])
' "$mount_path")

case "$mount_status" in
    mounted)
        print -r -- "Arcadia already mounted: $mount_path"
        exit 0
        ;;
    unmounted) ;;
    *)
        print -u2 -r -- "Arcadia mount needs review: $mount_status"
        exit 1
        ;;
esac

for credentials in "$HOME/.config/shell/secrets.zsh" "$HOME/.config/shell/secrets-after-customize.zsh"; do
    if [[ -f "$credentials" ]]; then
        source "$credentials" > /dev/null 2>&1
    fi
done

if [[ -S "$HOME/.skotty/sock/default.sock" ]]; then
    export SSH_AUTH_SOCK="$HOME/.skotty/sock/default.sock"
fi

print -r -- "Mounting Arcadia: $mount_path"
exec /usr/local/bin/arc mount --foreground "$mount_path"
