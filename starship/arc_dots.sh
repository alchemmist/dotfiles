#!/usr/bin/env bash
# arc_dots.sh ahead|behind — точки по числу коммитов впереди/позади remote.
# Замена custom.gahead (неотправленные коммиты) и custom.gbehind.
# База сравнения: remote_head текущей ветки из `arc info` (на trunk — голова
# arcadia/trunk; на запушенной ветке — её remote-голова). Если ветка ещё не
# запушена, remote_head нет → берём arcadia/trunk, и тогда «впереди» = все
# локальные коммиты ветки (= неотправленные), как и в git-версии HEAD --not --remotes.

arc info >/dev/null 2>&1 || exit 0
info=$(arc info 2>/dev/null)
base=$(printf '%s' "$info" | sed -n 's/^remote_head: //p')
[ -z "$base" ] && base="arcadia/trunk"

case "$1" in
  ahead)  range="$base..HEAD"; glyph="" ;;
  behind) range="HEAD..$base"; glyph="" ;;
  *) exit 0 ;;
esac

n=$(arc log "$range" --oneline 2>/dev/null | grep -c .)
i=0
while [ "$i" -lt "$n" ]; do printf '%s' "$glyph"; i=$((i + 1)); done
