#!/usr/bin/env bash

SERVICE="hypridle"

STATUS_ON='{"text":"Caffeine","class":"activated","alt":"activated","tooltip":"Sleep inhibited"}'
STATUS_OFF='{"text":"Idle","class":"deactivated","alt":"deactivated","tooltip":"Sleep allowed"}'

is_active() {
  systemctl --user is-active --quiet "$SERVICE"
}

toggle() {
  if is_active; then
    systemctl --user stop "$SERVICE"
  else
    systemctl --user start "$SERVICE"
  fi
}

case "$1" in
  -s|--status)
    if is_active; then
      echo "$STATUS_ON"
    else
      echo "$STATUS_OFF"
    fi
    ;;
  -t|--toggle)
    toggle
    ;;
esac

