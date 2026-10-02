[[ -f "${HOME}/Library/Application Support/kiro-cli/shell/zprofile.pre.zsh" ]] && builtin source "${HOME}/Library/Application Support/kiro-cli/shell/zprofile.pre.zsh"

export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/usr/local/jamf/bin

export PATH="/opt/local/bin:/opt/local/sbin:$PATH"

export PATH="$HOME/.local/bin:$PATH"

[[ -f "${HOME}/Library/Application Support/kiro-cli/shell/zprofile.post.zsh" ]] && builtin source "${HOME}/Library/Application Support/kiro-cli/shell/zprofile.post.zsh"
