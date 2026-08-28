#!/usr/bin/env bash
set -Eeuo pipefail

sudo systemctl stop fprintd.service 2>/dev/null || true
sudo rm -f -- /etc/systemd/system/fprintd.service.d/10-goodix-5f10.conf
sudo rm -f -- /opt/goodix-5f10/lib/libfprint-2.so.2
sudo rm -f -- /opt/goodix-5f10/lib/libfprint-2.so.2.0.0
sudo rmdir -- /opt/goodix-5f10/lib 2>/dev/null || true
sudo rmdir -- /opt/goodix-5f10 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl reset-failed fprintd.service 2>/dev/null || true

printf '%s\n' 'Goodix libfprint overlay removed.'
printf '%s\n' 'The protected PSK and enrolled prints were retained under /var/lib/fprint.'
