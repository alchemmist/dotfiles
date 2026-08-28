#!/usr/bin/env bash

set -u

readonly SERVICE="hypridle.service"
readonly WAYBAR_SIGNAL=7
readonly STATUS_ENABLED='{"text":"Hypridle enabled","class":"enabled","alt":"enabled","tooltip":"Автогашение и блокировка включены"}'
readonly STATUS_DISABLED='{"text":"Hypridle disabled","class":"disabled","alt":"disabled","tooltip":"Автогашение и блокировка отключены"}'

is_enabled() {
  pgrep -x hypridle >/dev/null
}

print_status() {
  if is_enabled; then
    printf '%s\n' "$STATUS_ENABLED"
  else
    printf '%s\n' "$STATUS_DISABLED"
  fi
}

notify_waybar() {
  pkill -SIGRTMIN+"$WAYBAR_SIGNAL" waybar 2>/dev/null || true
}

start_hypridle() {
  systemctl --user start "$SERVICE"
}

stop_hypridle() {
  systemctl --user stop "$SERVICE" 2>/dev/null || true
  pkill -x hypridle 2>/dev/null || true
}

toggle() {
  if is_enabled; then
    stop_hypridle
  else
    start_hypridle
  fi

  notify_waybar
}

case "${1:-}" in
  -t|--toggle)
    toggle
    ;;
  -s|--status|"")
    print_status
    ;;
  *)
    printf 'Usage: %s [--status|--toggle]\n' "$0" >&2
    exit 2
    ;;
esac
