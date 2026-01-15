#!/usr/bin/env bash

SERVICE_NAME="wg-quick@wg0"
STATUS_CONNECTED_STR='{"text":"Connected","class":"connected","alt":"connected", "tooltip": "VPN: cnnected"}'
STATUS_DISCONNECTED_STR='{"text":"Disconnected","class":"disconnected","alt":"disconnected", "tooltip": "VPN: disconnected"}'

function status_wireguard() {
    sudo wg show wg0 &>/dev/null
    return $?
}


function toggle_wireguard() {
    if status_wireguard; then
        sudo wg-quick down wg0
        sudo systemctl restart NetworkManager
    else
        sudo resolvconf -u
        sudo wg-quick up wg0
    fi
}

case $1 in
-s | --status)
    status_wireguard && echo $STATUS_CONNECTED_STR || echo $STATUS_DISCONNECTED_STR
    ;;
-t | --toggle)
    toggle_wireguard
    ;;
*) ;;
esac
