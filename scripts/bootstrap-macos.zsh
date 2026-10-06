#!/bin/zsh -f
set -euo pipefail

repo_root="${0:A:h:h}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PYTHONDONTWRITEBYTECODE=1

if ! command -v brew >/dev/null 2>&1; then
    print -u2 -- 'Install Homebrew first, then run dotter deploy again.'
    exit 1
fi

if ! HOMEBREW_NO_AUTO_UPDATE=1 brew bundle check --file "$repo_root/macos/Brewfile" >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew bundle install --no-upgrade --file "$repo_root/macos/Brewfile"
fi

stefania_python="$HOME/.venvs/stefania/bin/python"
if [[ ! -x "$stefania_python" ]]; then
    uv python install 3.12
    uv venv --python 3.12 --seed "$HOME/.venvs/stefania"
fi
"$stefania_python" -c 'import xml.parsers.expat'
uv pip install --python "$stefania_python" tomlkit json5 websockets requests PyYAML
if ! command -v mbake >/dev/null 2>&1; then
    uv tool install --python "$stefania_python" mbake==1.4.6
fi

set +u
for credentials in "$HOME/.config/shell/secrets.zsh" "$HOME/.config/shell/secrets-after-customize.zsh"; do
    if [[ -f "$credentials" ]]; then
        source "$credentials" > /dev/null 2>&1
    fi
done
set -u
export STEFANIA_PYTHON="$stefania_python"
exec "$stefania_python" "$repo_root/scripts/deploy-macos.py" apply
