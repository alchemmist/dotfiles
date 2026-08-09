#!/usr/bin/env bash
set -euo pipefail

# macOS-версия macos-screenshot.sh: выделение области через flameshot
# (по умолчанию) или нативный screencapture, закругление углов + тень через
# ImageMagick, копирование готового PNG в буфер обмена.

# Папка для скриншотов
OUT_DIR="$HOME/Pictures/screenshots"
mkdir -p "$OUT_DIR"

# Финальное имя
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
FINAL="$OUT_DIR/$TIMESTAMP.png"

# Временные файлы
TMP1="$(mktemp -t shot_raw).png"
TMP2="$(mktemp -t shot_rounded).png"

# Очистка временных файлов
cleanup() {
    rm -f "$TMP1" "$TMP2"
}
trap cleanup EXIT

# Выбор инструмента и задержка перед заморозкой экрана.
# flameshot замораживает экран в момент запуска: т.к. скрипт стартует из
# терминала, при перехвате фокуса активное окно уходит назад и в кадр попадают
# только обои. Задержка даёт время вернуть нужное окно на передний план.
# Переопределяется флагом --delay <ms> или переменной SHOT_DELAY.
TOOL="flameshot"
DELAY_MS="${SHOT_DELAY:-1500}"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --flameshot) TOOL="flameshot" ;;
        --native)    TOOL="native" ;;
        --delay)     DELAY_MS="$2"; shift ;;
        --no-delay)  DELAY_MS=0 ;;
        *)
            echo "Неизвестный параметр: $1"
            echo "Использование: $0 [--flameshot|--native] [--delay <ms>|--no-delay]"
            exit 1
            ;;
    esac
    shift
done

# flameshot может лежать внутри .app-бандла, не будучи в PATH
FLAMESHOT="$(command -v flameshot || true)"
if [[ -z "$FLAMESHOT" && -x "/Applications/flameshot.app/Contents/MacOS/flameshot" ]]; then
    FLAMESHOT="/Applications/flameshot.app/Contents/MacOS/flameshot"
fi
# Резолвим симлинки (на PATH обычно лежит симлинк на бинарник внутри бандла),
# чтобы корректно вычислить путь к Qt-плагинам бандла.
while [[ -L "$FLAMESHOT" ]]; do
    FLAMESHOT="$(readlink "$FLAMESHOT")"
done

# Снятие скриншота
if [[ "$TOOL" == "flameshot" ]]; then
    if [[ -z "$FLAMESHOT" ]]; then
        echo "flameshot не найден. Установи: brew install --cask flameshot" >&2
        exit 1
    fi
    if [[ "$DELAY_MS" -gt 0 ]]; then
        echo "Через $((DELAY_MS / 1000))с откроется выделение — успей переключиться на нужное окно."
    fi
    echo "Выделите область — затем сохраните (Enter/иконка сохранения)."
    # На маке нужен Qt-плагин cocoa; в окружении унаследован
    # QT_QPA_PLATFORM=wayland (Linux-конфиг), из-за чего flameshot падает.
    # Также явно указываем путь к Qt-плагинам внутри .app-бандла, иначе
    # cocoa-плагин не находится. --raw выводит область PNG-ом в stdout,
    # -d задерживает заморозку экрана.
    QT_PLUGINS_DIR="$(cd "$(dirname "$FLAMESHOT")/../PlugIns/platforms" && pwd)"
    QT_QPA_PLATFORM=cocoa \
    QT_QPA_PLATFORM_PLUGIN_PATH="$QT_PLUGINS_DIR" \
        "$FLAMESHOT" gui -d "$DELAY_MS" --raw > "$TMP1" || true
else
    # Нативный путь: -i интерактивно, -o без тени окна
    screencapture -i -o "$TMP1" || true
fi

# Пользователь отменил выделение — файл пустой/не создан
if [[ ! -s "$TMP1" ]]; then
    echo "Скриншот отменён."
    exit 0
fi

# Закругление углов
"$HOME/scripts/png-radius.sh" "$TMP1" "$TMP2" 1.5

# Добавление тени
"$HOME/scripts/png-shadow.sh" "$TMP2" "$FINAL"

# Копирование в буфер обмена (PNG как картинка, через AppleScript)
osascript -e "set the clipboard to (read (POSIX file \"$FINAL\") as «class PNGf»)"

echo "Скриншот сохранён в $FINAL и скопирован в буфер обмена."
