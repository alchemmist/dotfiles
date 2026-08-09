#!/usr/bin/env bash
# arc_status.sh — статус рабочей копии Arc (замена git_status).
# Печатает ОДНО число — сколько ВСЕГО файлов изменено (= число строк arc status:
# modified+staged+deleted+renamed+untracked+conflicted), плюс отдельный значок стэша.

arc info >/dev/null 2>&1 || exit 0
sb=$(arc status -sb 2>/dev/null) || exit 0

total=0 conflicted=0 modified=0 staged=0 renamed=0 deleted=0 untracked=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  case "$line" in '## '*) continue ;; esac
  total=$((total + 1))
  x=${line:0:1}; y=${line:1:1}; code="$x$y"
  case "$code" in
    '??') untracked=$((untracked + 1)); continue ;;
    *U*|AA|DD) conflicted=$((conflicted + 1)); continue ;;
  esac
  case "$x" in [AMDRC]) staged=$((staged + 1)) ;; esac
  [ "$x" = "R" ] && renamed=$((renamed + 1))
  [ "$y" = "M" ] && modified=$((modified + 1))
  [ "$y" = "D" ] && deleted=$((deleted + 1))
done <<< "$sb"

stashed=$(arc stash list 2>/dev/null | grep -c .)

out=""
[ "$total"   -gt 0 ] && out+=" ${total} "
[ "$stashed" -gt 0 ] && out+="📦 "
printf '%s' "$out"
