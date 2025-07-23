#!/bin/bash

if pgrep -x "caffeine" > /dev/null
then
    pkill caffeine
else
    caffeine &
fi

