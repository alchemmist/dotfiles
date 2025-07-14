#!/bin/bash

INTERFACE="wg0"
PASSWORD=""

# Функция для проверки, активен ли VPN
is_vpn_active() {
    sshpass -p "$PASSWORD" sudo /usr/bin/wg show "$INTERFACE" &> /dev/null
    return $?
}

# Логика отображения состояния и переключения
case "$1" in
    toggle)
        if is_vpn_active; then
            sshpass -p "$PASSWORD" sudo /usr/bin/wg-quick down "$INTERFACE"
        else
            sshpass -p "$PASSWORD" sudo /usr/bin/wg-quick up "$INTERFACE"
        fi
        ;;
    *)
        if is_vpn_active; then
            echo -e "󱀣" # 󱀣 Эмодзи для активного VPN
        else
            echo -e "" # Эмодзи для выключенного VPN
        fi
        ;;
esac

