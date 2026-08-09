#!/usr/bin/env bash
# arc_state.sh — показывает идущую операцию Arc (замена git_state).
# Arc-аналоги git-состояний живут в sequencer: rebase и cherry-pick.
# merge/revert/am в arc-workflow не встречаются. Символ — жёлтый.
# Прогресс current/total из sequencer ненадёжен (для 1-коммитного rebase
# даёт «1/2»), поэтому показываем только символ состояния.

arc info >/dev/null 2>&1 || exit 0
seq=$(arc info 2>/dev/null | sed -n 's/^sequencer: //p')
[ -z "$seq" ] && exit 0

Y=$'\033[33m'; Z=$'\033[0m'
case "$seq" in
  rebase)       sym="" ;;
  cherry-pick)  sym="" ;;
  bisect)       sym="" ;;
  *)            sym="" ;;
esac
printf '%s%s%s ' "$Y" "$sym" "$Z"
