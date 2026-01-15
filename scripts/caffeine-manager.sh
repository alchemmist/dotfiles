#!/usr/bin/env bash

SERVICE="hypridle"

STATUS_CAFFEINE='{"text":"Caffeine","class":"activated","alt":"activated","tooltip":"Sleep inhibited"}'
STATUS_IDLE='{"text":"Idle","class":"deactivated","alt":"deactivated","tooltip":"Sleep allowed"}'

is_idle_active() {
  systemctl --user is-active --quiet "$SERVICE"
}

print_status() {
  if is_idle_active; then
    echo "$STATUS_IDLE"
  else
    echo "$STATUS_CAFFEINE"
  fi
}

toggle() {
  if is_idle_active; then
    systemctl --user stop "$SERVICE"
  else
    systemctl --user start "$SERVICE"
  fi
}

case "$1" in
  -t|--toggle)
    toggle
    sleep 0.1
    print_status
    ;;
  -s|--status|"")
    print_status
    ;;
esac

