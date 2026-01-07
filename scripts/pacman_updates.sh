#!/usr/bin/env bash

echo "0"

while true; do
    sleep 60
    count=$(checkupdates | wc -l)
    echo "$count"
done

