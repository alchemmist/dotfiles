#!/bin/zsh

# Switch the shared terminal theme on macOS.  Alacritty live-reloads its import,
# tmux gets its server-wide styles updated, and running Neovim instances are
# told to reload their Koda variant.

set -euo pipefail

CONFIG="${ALACRITTY_CONFIG:-$HOME/.config/alacritty/alacritty.toml}"
THEME_DIR="${ALACRITTY_THEME_DIR:-$HOME/.config/alacritty/themes}"
STATE_FILE="${MOSS_THEME_STATE:-$HOME/.local/share/nvim/last_theme.txt}"
CODEX_CONFIG="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
DARK_IMPORT='"~/.config/alacritty/themes/moss-dark.toml"'
LIGHT_IMPORT='"~/.config/alacritty/themes/moss-light.toml"'

usage() {
    print "Usage: $0 [toggle|light|dark]"
}

current_theme() {
    if grep -Eq "^[[:space:]]*${LIGHT_IMPORT}[[:space:]]*,?" "$CONFIG"; then
        print light
    else
        print dark
    fi
}

set_alacritty_theme() {
    local theme="$1"
    local import_line
    local other_line

    if [[ "$theme" == light ]]; then
        import_line="$LIGHT_IMPORT"
        other_line="$DARK_IMPORT"
    else
        import_line="$DARK_IMPORT"
        other_line="$LIGHT_IMPORT"
    fi

    # macOS /usr/bin/sed has no GNU -i syntax. Perl is present on macOS and
    # lets us edit the symlink target without replacing the symlink itself.
    THEME_TO_COMMENT="$other_line" THEME_TO_UNCOMMENT="$import_line" \
        perl -pi -e \
        'if (/^\s*\Q$ENV{THEME_TO_COMMENT}\E\s*,?\s*$/) { s/^/# / }' \
        -e \
        'if (/^\s*#\s*\Q$ENV{THEME_TO_UNCOMMENT}\E\s*,?\s*$/) { s/^\s*#\s*// }' \
        "$CONFIG"
}

set_tmux_theme() {
    local tmux_bin
    tmux_bin="${TMUX_BIN:-$(command -v tmux || true)}"
    [[ -n "$tmux_bin" ]] || return 0
    "$tmux_bin" has-session 2>/dev/null || return 0

    if [[ "$1" == light ]]; then
        "$tmux_bin" set -g @theme light
        "$tmux_bin" set -g status-style 'fg=#505050,bg=default,none'
        "$tmux_bin" set -g window-status-style 'fg=#6f6f6f,bg=default,none'
        "$tmux_bin" set -g window-status-current-style 'fg=#487413,bg=default,bold'
        "$tmux_bin" set -g pane-border-style 'fg=#b0b0b0,bg=default'
        "$tmux_bin" set -g pane-active-border-style 'fg=#5f9c5f,bg=default'
        "$tmux_bin" set -g message-style 'fg=#505050,bg=default,none'
        "$tmux_bin" set -g message-command-style 'fg=#487413,bg=default,none'
        "$tmux_bin" set -g mode-style 'fg=#487413,bg=default,none'
        "$tmux_bin" set -g @claude_usage_color_normal '#505050'
        "$tmux_bin" set -g @claude_usage_label_color '#707070'
    else
        "$tmux_bin" set -g @theme dark
        "$tmux_bin" set -g status-style 'fg=#8a8a8a,bg=default,none'
        "$tmux_bin" set -g window-status-style 'fg=#8a8a8a,bg=default,none'
        "$tmux_bin" set -g window-status-current-style 'fg=#487413,bg=default,bold'
        "$tmux_bin" set -g pane-border-style 'fg=#303030,bg=default'
        "$tmux_bin" set -g pane-active-border-style 'fg=#6aa84f,bg=default'
        "$tmux_bin" set -g message-style 'fg=#8a8a8a,bg=default,none'
        "$tmux_bin" set -g message-command-style 'fg=#8fce72,bg=default,none'
        "$tmux_bin" set -g mode-style 'fg=#6aa84f,bg=default,none'
        "$tmux_bin" set -g @claude_usage_color_normal '#8a8a8a'
        "$tmux_bin" set -g @claude_usage_label_color '#6c6c6c'
    fi
    "$tmux_bin" refresh-client -S 2>/dev/null || true
}

set_codex_terminal_palette() {
    [[ -f "$CODEX_CONFIG" ]] || return 0
    grep -Eq '^[[:space:]]*theme[[:space:]]*=[[:space:]]*"ansi"[[:space:]]*$' "$CODEX_CONFIG" \
        && return 0

    if grep -Eq '^[[:space:]]*theme[[:space:]]*=' "$CODEX_CONFIG"; then
        perl -pi -e 's/^\s*theme\s*=.*/theme = "ansi"/' "$CODEX_CONFIG"
    else
        perl -0pi -e 's/(\[tui\]\n)/$1theme = "ansi"\n/' "$CODEX_CONFIG"
    fi
}

send_nvim_theme() {
    local command="$1"
    local nvim_bin="${NVIM_BIN:-$(command -v nvim || true)}"
    [[ -n "$nvim_bin" ]] || return 0

    # Neovim sockets are commonly under TMPDIR on macOS, unlike Linux's
    # XDG_RUNTIME_DIR convention.  The explicit --listen sockets are safe to
    # probe; failed probes are silently ignored.
    local socket
    while IFS= read -r socket; do
        [[ -S "$socket" ]] || continue
        "$nvim_bin" --server "$socket" --remote-send "<Esc>:${command}<CR>" >/dev/null 2>&1 || true
    done < <(find -L "${TMPDIR:-/tmp}" /tmp /private/tmp -type s -name 'nvim.*' -print 2>/dev/null | sort -u)
}

theme="${1:-toggle}"
case "$theme" in
    toggle)
        [[ "$(current_theme)" == light ]] && theme=dark || theme=light
        ;;
    light|dark)
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac

[[ -f "$CONFIG" ]] || { print -u2 "Alacritty config not found: $CONFIG"; exit 1; }
[[ -d "$THEME_DIR" ]] || { print -u2 "Alacritty theme directory not found: $THEME_DIR"; exit 1; }

set_alacritty_theme "$theme"
mkdir -p "${STATE_FILE:h}"
print -r -- "$theme" > "$STATE_FILE"
set_codex_terminal_palette
/Users/antonmoss/go/bin/lazy-tmux hook theme "$theme"
set_tmux_theme "$theme"
    send_nvim_theme "colorscheme koda-${theme}"
print "$theme"
