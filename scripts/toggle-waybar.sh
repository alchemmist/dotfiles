#!/usr/bin/env bash
# toggle-waybar.sh
# Тогглит процесс waybar: если не запущен — стартует, если запущен — убивает.
# Дополнительно меняет gaps_out в hyprland config через hyprctl keyword.

set -u

# ------------------------ Настройки ------------------------
WAYBAR_CMD='waybar --config /home/alchemmist/.config/waybar/hypr-config.json --style /home/alchemmist/.config/waybar/hypr-style.css'
PIDFILE="${XDG_RUNTIME_DIR:-$HOME/.cache}/waybar-autohide.pid"
# -----------------------------------------------------------

user_name=$(id -un)

log() { printf '[%s] %s\n' "$(date +'%H:%M:%S')" "$*" >&2; }

start_waybar() {
    log "Запускаю waybar..."
    setsid bash -c "$WAYBAR_CMD" >/dev/null 2>&1 &
    sleep 0.2
    pid=$(pgrep -u "$user_name" -n -x waybar || true)
    if [ -n "$pid" ]; then
        echo "$pid" > "$PIDFILE"
        chmod 600 "$PIDFILE" 2>/dev/null || true
        log "waybar запущен (PID $pid)"
        # выставляем gaps_out для режима с баром
        hyprctl keyword general:gaps_out "8, 15, 15, 15" >/dev/null 2>&1 || true
    else
        log "Не удалось найти процесс waybar после старта"
    fi
}

stop_waybar() {
    # выставляем gaps_out для режима без бара
    hyprctl keyword general:gaps_out "15, 15, 15, 15" >/dev/null 2>&1 || true

    if [ -f "$PIDFILE" ]; then
        pid=$(cat "$PIDFILE" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "Останавливаю waybar (PID $pid)"
            kill "$pid" || true
            sleep 0.2
            if kill -0 "$pid" 2>/dev/null; then
                log "Принудительно убиваю waybar (kill -9)"
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$PIDFILE" 2>/dev/null || true
    else
        log "Останавливаю все процессы waybar для пользователя $user_name"
        pkill -u "$user_name" -x waybar 2>/dev/null || true
    fi
}

# ------------------ Основная логика ------------------
if pgrep -u "$user_name" -x waybar >/dev/null 2>&1; then
    stop_waybar
else
    start_waybar
fi

# ------------------ Использование ------------------
# 1) Сохранить файл, дать права: chmod +x toggle-waybar.sh
# 2) Запустить для переключения: ./toggle-waybar.sh
# 3) Можно привязать к хоткею в Hyprland: 
#    bind = SUPER, B, exec, /home/alchemmist/.config/waybar/toggle-waybar.sh
