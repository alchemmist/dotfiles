#!/usr/bin/env bash
set -Eeuo pipefail

readonly SOURCE=/var/lib/fprint/goodix-5f10/psk
destination=${1:-}

if [[ -z $destination || $destination == -h || $destination == --help ]]; then
    printf 'Usage: %s /path/on/encrypted-or-external-storage/goodix-5f10.psk\n' "$0"
    [[ -n $destination ]] && exit 0
    exit 2
fi

destination=$(realpath -m -- "$destination")
sudo test -f "$SOURCE" || { printf 'Installed PSK not found: %s\n' "$SOURCE" >&2; exit 1; }
[[ $(sudo stat -c %s -- "$SOURCE") == 32 ]] || {
    printf 'Installed PSK has an unexpected size.\n' >&2
    exit 1
}

install -d -m 0700 -- "$(dirname -- "$destination")"
sudo install -m 0600 -- "$SOURCE" "$destination"
sudo chown "$(id -u):$(id -g)" -- "$destination"
printf 'PSK backup written to %s (raw 32 bytes, mode 0600).\n' "$destination"
printf 'Keep it encrypted/private. Never commit it to this repository.\n'
