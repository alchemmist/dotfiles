[[ -f "${HOME}/Library/Application Support/kiro-cli/shell/bashrc.pre.bash" ]] && builtin source "${HOME}/Library/Application Support/kiro-cli/shell/bashrc.pre.bash"

if command -v shellfirm >/dev/null 2>&1; then
    eval "$(shellfirm init bash)"
fi

if [ -f "$HOME/.cargo/env" ]; then
    . "$HOME/.cargo/env"
fi

export PATH="$HOME/.local/bin:$PATH"

[[ -f "${HOME}/Library/Application Support/kiro-cli/shell/bashrc.post.bash" ]] && builtin source "${HOME}/Library/Application Support/kiro-cli/shell/bashrc.post.bash"
