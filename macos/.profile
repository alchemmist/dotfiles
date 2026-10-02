[ -f "${HOME}/Library/Application Support/kiro-cli/shell/profile.pre.bash" ] && . "${HOME}/Library/Application Support/kiro-cli/shell/profile.pre.bash"

if [ -f "$HOME/.cargo/env" ]; then
    . "$HOME/.cargo/env"
fi

export PATH="$HOME/.local/bin:$PATH"

[ -f "${HOME}/Library/Application Support/kiro-cli/shell/profile.post.bash" ] && . "${HOME}/Library/Application Support/kiro-cli/shell/profile.post.bash"
