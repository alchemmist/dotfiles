#!/usr/bin/env bash
set -euo pipefail

# Включаем Wayland для Qt
export QT_QPA_PLATFORM=wayland

# Запускаем quickshell-интерфейс (он не блокирует)
quickshell -c hyprquickshot -n &

# Подождем чуть, чтобы UI успел отрисоваться
sleep 0.2

# Теперь твой macOS-скрипт (grim/flameshot + оформление)
"$HOME/scripts/macos-screenshot.sh" "$@" &

# (опционально) можно завершить quickshell после скриншота
sleep 0.3 && pkill -f "quickshell -c hyprquickshot" || true

