#!/usr/bin/env bash
# waybar-autohide-kill-start.sh
# Управляет запуском/остановкой waybar: убивает процесс, когда курсор уходит от верхней границы,
# и запускает командой WAYBAR_CMD, когда курсор попадает в верхнюю часть экрана.
# Предназначен для Hyprland (используется `hyprctl -j cursorpos`).
# Требования: jq, hyprctl, setsid, pgrep, pkill

set -u

# ------------------------ Настройки ------------------------
# Команда для запуска waybar (замени, если у тебя другой путь)
WAYBAR_CMD='waybar --config /home/alchemmist/.config/waybar/hypr-config.json --style /home/alchemmist/.config/waybar/hypr-style.css'

# Путь для файла PID (по умолчанию используем XDG_RUNTIME_DIR, иначе ~/.cache)
PIDFILE="${XDG_RUNTIME_DIR:-$HOME/.cache}/waybar-autohide.pid"

# Чувствительность/поведение (подбери под себя)
TOP_Y=6        # сколько пикселей от верхнего края считать "вверху"
INTERVAL=0.05  # период опроса курсора (s)
THRESH=3       # количество подряд опросов для подтверждения состояния (дебаунс)

# -----------------------------------------------------------

visible=0
enter_count=0
leave_count=0
user_name=$(id -un)

log() { printf '[%s] %s\n' "$(date +'%H:%M:%S')" "$*" >&2; }

start_waybar() {
    # не стартуем, если уже наш PID файл указывает на живой процесс
    if [ -f "$PIDFILE" ]; then
        pid=$(cat "$PIDFILE" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "waybar уже запущен (PID $pid)"
            visible=1
            return
        else
            rm -f "$PIDFILE" || true
        fi
    fi

    log "Запускаю waybar..."
    # запускаем в отдельной сессии
    setsid bash -c "$WAYBAR_CMD" >/dev/null 2>&1 &
    # даём чуть-чуть времени на старт
    sleep 0.2

    # находим самый новый процесс waybar пользователя
    pid=$(pgrep -u "$user_name" -n -x waybar || true)
    if [ -n "$pid" ]; then
        echo "$pid" > "$PIDFILE"
        chmod 600 "$PIDFILE" 2>/dev/null || true
        visible=1
        log "waybar запущен (PID $pid)"
    else
        log "Не удалось найти процесс waybar после старта"
    fi
}

stop_waybar() {
    if [ -f "$PIDFILE" ]; then
        pid=$(cat "$PIDFILE" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "Останавливаю waybar (PID $pid)"
            kill "$pid" || true
            # ждём, пока завершится (короткое ожидание)
            for i in {1..20}; do
                if kill -0 "$pid" 2>/dev/null; then
                    sleep 0.1
                else
                    break
                fi
            done
            if kill -0 "$pid" 2>/dev/null; then
                log "Принудительно убиваю waybar (kill -9)"
                kill -9 "$pid" 2>/dev/null || true
            fi
        else
            log "PID-файл есть, но процесса нет. Попробую pkill waybar"
            pkill -u "$user_name" -x waybar 2>/dev/null || true
        fi
        rm -f "$PIDFILE" 2>/dev/null || true
    else
        # если PID-файла нет, пробуем найти процессы waybar этого пользователя
        if pgrep -u "$user_name" -x waybar >/dev/null 2>&1; then
            log "Останавливаю найденные процессы waybar"
            pkill -u "$user_name" -x waybar 2>/dev/null || true
        else
            log "waybar не найден"
        fi
    fi
    visible=0
}

# Очистка при выходе (опционально можно убрать остановку waybar при завершении скрипта)
cleanup() {
    log "Exiting... (script stopped)"
    # не останавливаем waybar автоматически при выходе — оставим как есть
    exit 0
}
trap cleanup INT TERM

# Основной цикл
while true; do
    raw=$(hyprctl -j cursorpos 2>/dev/null || true)
    if [ -z "$raw" ]; then
        # hyprctl мог временно вернуть пустоту — пропускаем
        sleep "$INTERVAL"
        continue
    fi

    y=$(printf '%s' "$raw" | jq -r '.y // empty' 2>/dev/null || true)
    if [ -z "$y" ]; then
        sleep "$INTERVAL"
        continue
    fi

    # Обрезаем дробную часть
    y_int=${y%.*}

    if [ "${y_int:-9999}" -le "$TOP_Y" ]; then
        enter_count=$((enter_count+1))
        leave_count=0
    else
        leave_count=$((leave_count+1))
        enter_count=0
    fi

    if [ "$enter_count" -ge "$THRESH" ] && [ "$visible" -eq 0 ]; then
        start_waybar
    fi

    if [ "$leave_count" -ge "$THRESH" ] && [ "$visible" -eq 1 ]; then
        sleep 1
        stop_waybar
    fi

    sleep "$INTERVAL"
done

# ------------------ Примеры использования ------------------
# 1) Сохранить файл, дать права: chmod +x waybar-autohide-kill-start.sh
# 2) Запустить вручную в сессии Hyprland (в той же среде Wayland):
#    ~/.config/waybar/waybar-autohide-kill-start.sh &
# 3) Добавить в конфиг Hyprland (autostart):
#    exec-once = /home/alchemmist/.config/waybar/waybar-autohide-kill-start.sh
#
# Примечания:
# - Скрипт рассчитан на запуск из сессии (чтобы он видел XDG_RUNTIME_DIR и Wayland сокет).
# - Если ты хочешь systemd --user unit, лучше запускать unit как часть сессии (user unit, "lingering" может быть не нужен).
# -----------------------------------------------------------

