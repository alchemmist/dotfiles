if [ -f "$HOME/.cargo/env" ]; then
    . "$HOME/.cargo/env"
fi

if [ -S "$HOME/.skotty/sock/default.sock" ]; then
    export SSH_AUTH_SOCK="$HOME/.skotty/sock/default.sock"
fi
