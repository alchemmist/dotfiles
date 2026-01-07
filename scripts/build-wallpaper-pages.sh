#!/usr/bin/env bash

set -euo pipefail

# Используем переданную переменную окружения или текущую директорию
REPO_ROOT="${REPO_ROOT:-$(pwd)}"
echo "REPO_ROOT: $REPO_ROOT"

GEN_SCRIPT="$REPO_ROOT/scripts/gen-readme-for-wlp.sh"

if [ ! -x "$GEN_SCRIPT" ]; then
    echo "Ошибка: $GEN_SCRIPT не найден или не исполняемый"
    exit 1
fi

for dir in "$REPO_ROOT"/wallpapers/*/; do
    if [[ "$dir" == "$REPO_ROOT/wallpapers/white/" ]]; then
        echo "Пропускаю $dir"
        continue
    fi

    [ -d "$dir" ] || continue

    echo "Запускаю gen-readme-for-wlp.sh в $dir"
    (cd "$dir" && REPO_ROOT="$REPO_ROOT" bash "$GEN_SCRIPT")
done
