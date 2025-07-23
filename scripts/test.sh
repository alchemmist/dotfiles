#!/bin/bash

# Находим PID последнего запущенного nvim
NVIM_PID=$(pgrep -n nvim)

# Если процесс найден
if [ -n "$NVIM_PID" ]; then
    # Получаем текущую директорию через /proc
    ACTIVE_DIR=$(readlink /proc/$NVIM_PID/cwd)
    echo "$ACTIVE_DIR"

    # Проверяем, что директория найдена
    if [ -n "$ACTIVE_DIR" ]; then
        # Запускаем новое окно Kitty с переходом в ту же директорию и активацией виртуального окружения
        kitty --directory "$ACTIVE_DIR" bash -c 'source venv/bin/activate'
    else
        echo "Не удалось определить рабочую директорию nvim."
    fi
else
    echo "Процесс nvim не найден."
fi

