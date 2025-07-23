#!/bin/bash

# Получаем информацию о батарее
battery_info=$(cat /sys/class/power_supply/BATT/capacity)

# Выводим заряд батареи
echo "󰁾 $battery_info%"
