#!/bin/sh
# Block commits that contain a Yandex OAuth token (y1__…).
set -e

matches=$(git grep --cached -I -n -E 'y1__[A-Za-z0-9_-]{20,}' -- . || true)
if [ -n "$matches" ]; then
	echo "refusing commit: Yandex OAuth token (y1__) is in the index" >&2
	printf '%s\n' "$matches" | sed -E 's/y1__[A-Za-z0-9_-]{8,}/y1__<redacted>/g' >&2
	exit 1
fi
