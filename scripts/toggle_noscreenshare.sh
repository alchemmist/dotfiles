#!/bin/bash

CONFIG_FILE="$HOME/.config/hypr/hyprland.conf"
STATE_FILE="$HOME/.config/hypr/.screenshare_rule_disabled"

RULE_REGEX='[[:space:]]*(windowrule|layerrule)[[:space:]]*=[[:space:]]*no_screen_share'

enable_rules() {
    sed -i --follow-symlinks -E "/^[[:space:]]*#?[[:space:]]*$RULE_REGEX/{
        s/^[[:space:]]*#[[:space:]]*//
    }" "$CONFIG_FILE"

    rm -f "$STATE_FILE"
    CLASS="on"
}

disable_rules() {
    sed -i --follow-symlinks -E "/^[[:space:]]*$RULE_REGEX/{
        /^[[:space:]]*#/! s/^/# /
    }" "$CONFIG_FILE"

    touch "$STATE_FILE"
    CLASS="off"
}

toggle_rules() {
    if [ -f "$STATE_FILE" ]; then
        enable_rules
    else
        disable_rules
    fi
}

case "$1" in
    toggle)
        toggle_rules
        ;;
    *)
        if [ -f "$STATE_FILE" ]; then
            CLASS="off"
        else
            CLASS="on"
        fi
        ;;
esac

echo "{\"class\": \"$CLASS\", \"alt\": \"$CLASS\"}"

