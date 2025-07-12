#!/bin/bash

echo "(1 - $(upower -i $(upower -e | grep BAT) | awk '\
        /energy-full:/ {ef=$2}\
        /energy-full-design:/ {efd=$2}\
        END {print ef/efd}')) * 100 + 0.5" \
	| bc \
	| cut -d'.' -f1

