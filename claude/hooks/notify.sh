#!/usr/bin/env bash
# Claude Code: Notification hook → уведомление через Hammerspoon (claudeNotify).
# Срабатывает, когда Claude просит подтвердить команду (permission_prompt)
# или задал вопрос / ждёт ввода (idle_prompt).
# Клик по баннеру переключает tmux на панель с ожидающим Claude и поднимает iTerm.
#
# Аргумент $1 — имя звука macOS (например Glass, Ping). По умолчанию Ping.

input=$(cat)
sound="${1:-Ping}"

message=$(printf '%s' "$input" | jq -r '.message // "Нужно твоё внимание"' 2>/dev/null)
[ -z "$message" ] && message="Нужно твоё внимание"

# Контекст панели tmux, из которой запущен Claude (хук наследует $TMUX_PANE).
subtitle="tmux"
if [ -n "$TMUX_PANE" ] && command -v tmux >/dev/null 2>&1; then
  info=$(tmux display-message -p -t "$TMUX_PANE" '#S: #W' 2>/dev/null)
  [ -n "$info" ] && subtitle="$info"
fi

# Аргументы в base64 — безопасны внутри одинарных кавычек (только [A-Za-z0-9+/=]).
b64() { printf '%s' "$1" | base64 | tr -d '\n'; }

HS=$(command -v hs || echo /opt/homebrew/bin/hs)
[ -x "$HS" ] || exit 0   # нет hs CLI — тихо выходим, не ломаем Claude

"$HS" -c "claudeNotify('$(b64 "$message")','$(b64 "$subtitle")','$(b64 "${TMUX_PANE:-}")','$(b64 "$sound")')" >/dev/null 2>&1

exit 0
