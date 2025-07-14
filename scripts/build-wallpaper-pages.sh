#!/usr/bin/env bash

set -euo pipefail

GEN_SCRIPT="$(realpath ./scripts/gen-readme-for-wlp.sh)"

if [ ! -x "$GEN_SCRIPT" ]; then
    echo "Ошибка: $GEN_SCRIPT не найден или не исполняемый"
    exit 1
fi

for dir in wallpapers/*/; do
    # Пропустить wallpapers/white/
    if [[ "$dir" == "wallpapers/white/" ]]; then
        echo "Пропускаю $dir"
        continue
    fi

    [ -d "$dir" ] || continue

    echo "Запускаю gen-readme-for-wallpapers.sh в $dir"
    ( cd "$dir" && bash "$GEN_SCRIPT" )
done

