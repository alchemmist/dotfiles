#!/usr/bin/env bash
set -euo pipefail

# Папка для скриншотов
OUT_DIR="$HOME/Pictures/screenshots"
mkdir -p "$OUT_DIR"

# Финальное имя
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
FINAL="$OUT_DIR/$TIMESTAMP.png"

# Временные файлы
TMP1="$(mktemp -t shot_raw.XXXXXX.png)"
TMP2="$(mktemp -t shot_rounded.XXXXXX.png)"

# Очистка временных файлов
cleanup() {
    rm -f "$TMP1" "$TMP2"
}
trap cleanup EXIT

# Выбор инструмента
TOOL="grim"
if [[ $# -gt 0 ]]; then
    case "$1" in
        --flameshot)
            TOOL="flameshot"
            ;;
        --grim)
            TOOL="grim"
            ;;
        *)
            echo "Неизвестный параметр: $1"
            echo "Использование: $0 [--grim|--flameshot]"
            exit 1
            ;;
    esac
fi

# Снятие скриншота
if [[ "$TOOL" == "grim" ]]; then
    grim -g "$(slurp)" - > "$TMP1"
elif [[ "$TOOL" == "flameshot" ]]; then
    echo "Выберите область, затем нажмите Enter/Сохранить"
    flameshot gui --raw > "$TMP1"
fi

# Закругление углов
"$HOME/scripts/png-radius.sh" "$TMP1" "$TMP2"

# Добавление тени
"$HOME/scripts/png-shadow.sh" "$TMP2" "$FINAL"

# Копирование в буфер обмена
wl-copy < "$FINAL"

echo "Скриншот сохранён в $FINAL и скопирован в буфер обмена."

