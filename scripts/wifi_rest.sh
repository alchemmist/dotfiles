#!/bin/bash

IFACE="wlp2s0"

case $1/$2 in
  pre/*)
    nmcli radio wifi off
    ;;
  post/*)
    sleep 3
    nmcli radio wifi on
    ;;
esac
