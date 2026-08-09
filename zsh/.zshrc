
# Kiro CLI pre block. Keep at the top of this file.
[[ -f "${HOME}/Library/Application Support/kiro-cli/shell/zshrc.pre.zsh" ]] && builtin source "${HOME}/Library/Application Support/kiro-cli/shell/zshrc.pre.zsh"

export PATH=$HOME/bin:$PATH
export PATH=$HOME/.local/bin:$PATH
export PATH=$HOME/scripts:$PATH
export PATH=/usr/local/bin:$PATH
export PATH=$HOME/.cargo/bin:$PATH
export PATH=$HOME/.python3.12/bin:$PATH
export PATH=/home/alchemmist/.local/lib/python3.12/site-packages:$PATH
export PATH=$HOME/code/syncthing-wrapper/src-tauri/target/release:$PATH
export PATH=/usr/local/texlive/2025/bin/x86_64-linux:$PATH
export PATH=/home/alchemmist/time-desktop-linux-x64:$PATH
export PATH=$HOME/code/CU-lms-wrapper/src-tauri/target/release:$PATH
export PATH=~/.npm-global/bin:$PATH
export PATH=$HOME/.elan/bin:$PATH
export PATH=/home/alchemmist/.local/share/gem/ruby/3.4.0/bin:$PATH
export PATH=/home/alchemmist/applications/codefetch/build:$PATH
export PATH=/home/alchemmist/applications/keywords/build:$PATH
export PATH=/home/alchemmist/applications/localports/target/release:$PATH
export PATH="$HOME/.npm-global/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"

export QT_QPA_PLATFORM=wayland

export PYTHONPATH=$PYTHONPATH:/usr/lib/python3.12/site-packages

export MANPATH=/usr/local/texlive/2024/texmf-dist/doc/man:$MANPATH
export INFOPATH=/usr/local/texlive/2024/texmf-dist/doc/info:$INFOPATH

export GOPATH=$HOME/go
export PATH=$GOPATH/bin:$PATH
export PATH=$GOPATH/bin:$PATH

export PATH=/usr/lib/jvm/java-23-openjdk/bin:$PATH

export XDG_DATA_HOME="$HOME/.local/share"

export OZONE_PLATFORME=wayland
export CHROME_EXECUTABLE=google-chrome-stable

export TERM=xterm-256color

export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH=$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH
export _ZO_DOCTOR=0

#export WAYLAND_DISPLAY=''
# Path to your Oh My Zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time Oh My Zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
ZSH_THEME="robbyrussell"

export EDITOR="nvim"
export STARSHIP_CONFIG=~/.config/starship/starship.toml

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in $ZSH/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment one of the following lines to change the auto-update behavior
# zstyle ':omz:update' mode disabled  # disable automatic updates
# zstyle ':omz:update' mode auto      # update automatically without asking
# zstyle ':omz:update' mode reminder  # just remind me to update when it's time

# Uncomment the following line to change how often to auto-update (in days).
# zstyle ':omz:update' frequency 13

# Uncomment the following line if pasting URLs and other text is messed up.
# DISABLE_MAGIC_FUNCTIONS="true"

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# You can also set it to another string to have that shown instead of the default red dots.
# e.g. COMPLETION_WAITING_DOTS="%F{yellow}waiting...%f"
# Caution: this setting can cause issues with multiline prompts in zsh < 5.7.1 (see #5765)
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.

plugins=(
    git
    gitfast
    zoxide
    fzf
    vi-mode
    you-should-use
)

source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi

stty -ixon

alias tuxsay="cowsay -f tux"
alias nvim_clear_swap="rm -rf ~/.local/state/nvim/swap/*"
alias latex_clear_cache="rm -rf ~/latex/aux/* && rm -rf ~/latex/out/*"
alias tex_compile="latexmk -pdf -silent -c -outdir=. -auxdir=/home/alchemmist/.cache/latex/aux"
alias xo="xdg-open"
alias cls="clear"
alias vim="/usr/bin/vim -u ~/.vimrc"
alias cd="z"

alias glog="git log --oneline --graph --decorate --all"
alias gacp="git add . && git commit --amend --no-edit && git push --force-with-lease"
alias gac="git add . && git commit --amend --no-edit"

alias pptx2pdf='libreoffice --headless --convert-to pdf'
alias mp42gif='~/scripts/mp42gif.sh'
alias cat='mycat'
alias cmatrix="unimatrix -n -s 97 -l o"
alias ad="arc diff | lumen diff --stdin"
alias ndiff="nvimdiv"


hp-scan() {
    cd ~/Pictures/scans
    yes "" | /usr/bin/hp-scan -m color
    cd -
}

dot() {
    cd ~/code/dotfiles
    dotter --force $argv
    cd -
}

STOP_MESSAGE="!!!    STOP     !!!\nWHAT ARE YOU DOING?"

BLACK_LIST=(
    "/*"
    "/"
    "~"
    "~/*"
)

check_blacklist() {
    for str in "${BLACK_LIST[@]}"; do
        if [[ "$1" == "$str" ]]; then
            return 0
        fi
    done
    return 1
}


source <(fzf --zsh)
# eval "fastfetch"
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
source ~/.oh-my-zsh/custom/plugins/fzf-tab/fzf-tab.plugin.zsh

# SSH-agent
if ! pgrep -u "$USER" ssh-agent >/dev/null; then
    eval "$(ssh-agent -s >/dev/null)"
fi

if [ "$(tty)" = "/dev/tty1" -o "$(tty)" = "/dev/tty2" ] && [ -z "$(printenv HYPRLAND_INSTANCE_SIGNATURE)" ]; then
    exec ~/.local/bin/wlinitrc
fi

# Функция для fzf, запускает поиск из текущей директории
fzf-widget() {
    zle reset-prompt
    local file
    file=$(find . -type f ! -readable -prune -o -print 2>/dev/null | fzf --reverse --height=40% --preview 'bat {} --color=always')
    if [[ -n $file ]]; then
        LBUFFER+="$file" # Вставляет выбранный файл в командную строку
    fi
    zle reset-prompt
}

# Функция для zi, теперь эмулирует Enter после смены директории
zi-widget() {
    zle reset-prompt
    zi
    zle accept-line # Эмулирует нажатие Enter
}

# Функция для yazi с автопереходом и эмуляцией Enter
y-widget() {
    local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
    yazi "$@" --cwd-file="$tmp"
    if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
        builtin cd -- "$cwd"
        zle reset-prompt
        zle accept-line # Эмулирует нажатие Enter
    fi
    rm -f -- "$tmp"
}

if [[ -t 1 ]]; then
    zle -N fzf-widget
    zle -N zi-widget
    zle -N y-widget

    bindkey '^G' fzf-widget
    bindkey '^J' zi-widget
    bindkey '^Y' y-widget

    bindkey -M viins '^[^?' backward-kill-word
    bindkey -M viins '^[' backward-kill-word
    bindkey -M viins '^H' backward-kill-word
else
    unsetopt zle
fi

mycat() {
    if file --mime-type "$1" | grep -q 'image/'; then
        kitten icat --align left --scale-up "$1"
    else
        command cat "$1"
    fi
}

PATH="/home/alchemmist/perl5/bin${PATH:+:${PATH}}"
export PATH
PERL5LIB="/home/alchemmist/perl5/lib/perl5${PERL5LIB:+:${PERL5LIB}}"
export PERL5LIB
PERL_LOCAL_LIB_ROOT="/home/alchemmist/perl5${PERL_LOCAL_LIB_ROOT:+:${PERL_LOCAL_LIB_ROOT}}"
export PERL_LOCAL_LIB_ROOT
PERL_MB_OPT="--install_base \"/home/alchemmist/perl5\""
export PERL_MB_OPT
PERL_MM_OPT="INSTALL_BASE=/home/alchemmist/perl5"
export PERL_MM_OPT

# pnpm
export PNPM_HOME="/home/alchemmist/.local/share/pnpm"
case ":$PATH:" in
    *":$PNPM_HOME:"*) ;;
    *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit
compinit

fzf-history-widget() {
    local selected extracted_with_perl=0
    local -a cmds
    local -a mbegin mend match

    setopt localoptions noglobsubst noposixbuiltins pipefail no_aliases no_glob no_ksharrays extendedglob 2> /dev/null

    local max_width=$(( COLUMNS > 100 ? 100 : COLUMNS - 10 ))
    local fzf_ui_opts="--height=30% --layout=reverse --border=rounded --info=inline --prompt='history> '"

    if zmodload -F zsh/parameter p:{commands,history} 2> /dev/null && [[ -n ${commands[perl]} ]]; then
        selected="$(
      printf '%s\t%s\000' "${(kv)history[@]}" |
      perl -0 -ne 'if (!$seen{(/^\s*[0-9]+\**\t(.*)/s, $1)}++) { s/\n/\n\t/g; print; }' |
      FZF_DEFAULT_OPTS=$(
        __fzf_defaults "" "-n2..,.. --scheme=history --bind=ctrl-r:toggle-sort,alt-r:toggle-raw --wrap-sign '\t↳ ' --highlight-line --multi $fzf_ui_opts --query=${(qqq)LBUFFER} --read0"
      ) \
      FZF_DEFAULT_OPTS_FILE='' COLUMNS=$max_width $(__fzfcmd)
    )"
        extracted_with_perl=1
    else
        selected="$(
      fc -rl 1 |
      __fzf_exec_awk '{ cmd=$0; sub(/^[ \t]*[0-9]+\**[ \t]+/, "", cmd); if (!seen[cmd]++) print $0 }' |
      FZF_DEFAULT_OPTS=$(
        __fzf_defaults "" "-n2..,.. --scheme=history --bind=ctrl-r:toggle-sort,alt-r:toggle-raw --wrap-sign '\t↳ ' --highlight-line --multi $fzf_ui_opts --query=${(qqq)LBUFFER}"
      ) \
      FZF_DEFAULT_OPTS_FILE='' COLUMNS=$max_width $(__fzfcmd)
    )"
    fi

    local ret=$?

    if [[ -n $selected ]]
    then
        if (
            (( extracted_with_perl )) && [[ $selected == <->$'\t'* ]]
            ) || (
            (( ! extracted_with_perl )) && [[ $selected == [[:blank:]]#<->(  |\* )* ]]
        )
        then
            for line in ${(ps:\n:)selected}
            do if (( extracted_with_perl ))
                then
                    if [[ $line == (#b)(<->)(#B)$'\t'* ]]
                    then
                        (( ${+history[${match[1]}]} )) && cmds+=("${history[${match[1]}]}")
                    fi
                elif [[ $line == [[:blank:]]#(#b)(<->)(#B)(  |\* )* ]]
                then
                    zle .push-line
                    zle vi-fetch-history -n ${match[1]}
                    (( ${#BUFFER} )) && cmds+=("${BUFFER}")
                    BUFFER=""
                    zle .get-line
                fi
            done

            if (( ${#cmds[@]} ))
            then
                BUFFER="${(pj:\n:)${(@)cmds%%$'\n'#}}"
                CURSOR=${#BUFFER}
            fi
        else
            LBUFFER="$selected"
        fi
    fi

    zle reset-prompt
    return $ret
}

zle -N fzf-history-widget
bindkey '^R' fzf-history-widget

autoload -Uz add-zsh-hook

function _pinglo_preexec() {
  local raw="$1"

  if [[ "$raw" == ' '* ]]; then
    export PINGLO_TRACKED_CMD="${raw# }"
    pinglo start --cmd "$PINGLO_TRACKED_CMD" --cwd "$PWD" >/dev/null 2>&1
  else
    unset PINGLO_TRACKED_CMD
  fi
}

function _pinglo_precmd() {
  local exit_code=$?
  if [[ -n "$PINGLO_TRACKED_CMD" ]]; then
    pinglo done --cmd "$PINGLO_TRACKED_CMD" --cwd "$PWD" --exit-code "$exit_code" >/dev/null 2>&1
    unset PINGLO_TRACKED_CMD
  fi
}

add-zsh-hook preexec _pinglo_preexec
add-zsh-hook precmd _pinglo_precmd

# Async cache для starship-промпта: номер PR (git → GitHub, arc → Arcanum).
# Git и Arc взаимоисключающие. Контекст определяем дёшево (walk вверх за .arc/.git),
# поиск PR НЕ на render-пути: при протухшем кэше дёргаем фоновый рефрешер, а
# starship-модули (ghpr / arc_pr) просто `cat`-ают готовый файл. Никогда не блокирует.
function _starship_vcs_precmd() {
  emulate -L zsh
  unset STARSHIP_GH_PR STARSHIP_ARC_BASE STARSHIP_DANGER

  # --- Arc-репозиторий? Дешёвый поиск .arc вверх по дереву (стоп до $HOME, чтобы
  #     не словить глобальный ~/.arc). Внутри Аркадии ветку/PR берём через arc. ---
  local d=$PWD found=''
  while [[ -n $d && $d != $HOME && $d != / ]]; do
    [[ -d $d/.arc ]] && { found=1; break; }
    d=${d:h}
  done
  if [[ -n $found ]]; then
    # $d — корень рабочей копии (каталог с .arc). НИКАКИХ вызовов arc здесь:
    # всю медленную работу делает фоновый arc-refresh.sh, промпт читает кэш.
    local root=$d
    local dir=${XDG_RUNTIME_DIR:-/tmp}/starship-arc
    local hash=$(print -r -- "$root" | cksum | cut -d' ' -f1)
    local base="$dir/$hash"
    export STARSHIP_ARC_BASE="$base"
    command mkdir -p $dir 2>/dev/null
    local mt=0
    zmodload -F zsh/stat b:zstat 2>/dev/null && zstat -A reply +mtime $base.branch 2>/dev/null && mt=$reply[1]
    zmodload zsh/datetime 2>/dev/null
    if (( ${EPOCHSECONDS:-0} - mt > 2 )); then          # кэш протух (>2с) — рефреш в фоне
      ( ~/.config/starship/arc-refresh.sh "$root" "$base" &>/dev/null &! )
    fi
    return
  fi

  # --- Git-репозиторий? root+branch считаем в шелле, без форков ---
  local root=$PWD
  while [[ $root != / && ! -e $root/.git ]]; do root=${root:h}; done
  if [[ -e $root/.git ]]; then
    local head branch=''
    if [[ -r $root/.git/HEAD ]]; then
      read -r head < $root/.git/HEAD
      [[ $head == 'ref: refs/heads/'* ]] && branch=${head#ref: refs/heads/}
    fi
    local dir=${XDG_CACHE_HOME:-$HOME/.cache}/starship-gh
    local base=$dir/${root//[^A-Za-z0-9._-]/_}__${branch//[^A-Za-z0-9._-]/_}
    export STARSHIP_GH_PR=$base.pr
    local mt=0
    zmodload -F zsh/stat b:zstat 2>/dev/null && zstat -A reply +mtime $base.pr 2>/dev/null && mt=$reply[1]
    zmodload zsh/datetime 2>/dev/null
    if (( ${EPOCHSECONDS:-0} - mt > 60 )); then
      command mkdir -p $dir 2>/dev/null
      ( ~/.config/starship/gh-prompt.py refresh "$root" "$branch" "$base" &>/dev/null &! )
    fi
  fi
}
add-zsh-hook precmd _starship_vcs_precmd

function ssh_tmux_deimos() {
  local tmux_bin="~/bin/tmux.appimage"
  local session

  session=$(
    ssh deimos.vla.yp-c.yandex.net \
      "$tmux_bin ls" |
      sed 's/:.*//' |
      fzf \
        --height=~25% \
        --layout=reverse \
        --border \
        --prompt='tmux session > '
  )

  [[ -z "$session" ]] && return

  exec ssh -t deimos.vla.yp-c.yandex.net \
    "$tmux_bin attach -t '$session'"
}

function _ssh_tmux_deimos_widget() {
  zle -I
  ssh_tmux_deimos
  zle reset-prompt
}

zle -N _ssh_tmux_deimos_widget
bindkey '^K' _ssh_tmux_deimos_widget
export PATH="$(brew --prefix llvm)/bin:$PATH"

# Machine-local secrets / env (tokens, LMS, Stefania) — kept OUT of the repo so
# they survive `dotter deploy`. The actual values live in ~/.zshrc.local (0600).
[ -f ~/.zshrc.local ] && source ~/.zshrc.local

# >>> stefania-customize >>>
# Командные переменные Стефании. Источник правды — сам файл;
# значения отсюда не читай, только source.
[ -f "${STEFANIA_HOME:-$HOME/.stefania}/customize.env" ] && source "${STEFANIA_HOME:-$HOME/.stefania}/customize.env"
# <<< stefania-customize <<<

# Added by Antigravity CLI installer
export PATH="/Users/antonmoss/.local/bin:$PATH"
alias arc-wt='/Users/antonmoss/bin/arc-wt'

zi-widget() {
  zle reset-prompt
  zi
  zle reset-prompt
}

zle -N zi-widget
bindkey -M emacs '^J' zi-widget
bindkey -M viins '^J' zi-widget
