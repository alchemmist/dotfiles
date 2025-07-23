
export PATH=$HOME/bin:$PATH
export PATH=$HOME/.local/bin:$PATH
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
export PATH=~/applications/eww/target/release:$PATH
export PATH=/home/alchemmist/applications/codefetch/build:$PATH



export QT_QPA_PLATFORM=xcb


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
source $ZSH/oh-my-zsh.sh

plugins=(
    git
    gitfast
    poetry
    zoxide
    fzf
    shellfirm
    docker
    docker-compose
)


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

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# Set personal aliases, overriding those provided by Oh My Zsh libs,
# plugins, and themes. Aliases can be placed here, though Oh My Zsh
# users are encouraged to define aliases within a top-level file in
# the $ZSH_CUSTOM folder, with .zsh extension. Examples:
# - $ZSH_CUSTOM/aliases.zsh
# - $ZSH_CUSTOM/macos.zsh
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"
# alias python="/home/alchemmist/.python3.12/bin/python"
# alias pip="/home/alchemmist/.python3.12/bin/pip"

alias pbcopy='wl-copy'
alias docker='~/scripts/docker.sh'
alias pbpaste='wl-paste'

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
# alias glog="serie"
alias pptx2pdf='libreoffice --headless --convert-to pdf'
alias mp42gif='~/scripts/mp42gif.sh'
alias cat='mycat'
alias cmatrix="unimatrix -n -s 97 -l o"



hp-scan() {
    cd ~/Pictures/scans
    yes "" | /usr/bin/hp-scan -m color
    cd -
}

dot() {
    cd ~/code/dotfiles
    dotter $argv
    cd -
}



# PROTECTION FOR RM COMMAND
# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # 
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

rm() {
    # Использовать настоящее rm, если явно указано --no-trash
    for arg in "$@"; do
        if [[ "$arg" == "--no-trash" ]]; then
            # Удаляем --no-trash из аргументов
            args=()
            for a in "$@"; do
                [[ "$a" != "--no-trash" ]] && args+=("$a")
            done
            /bin/rm "${args[@]}"
            return
        fi
    done

    # Предотвращаем удаление критичных путей
    for arg in "$@"; do
        if check_blacklist "$arg"; then
            echo -e "$STOP_MESSAGE"
            return 1
        fi
    done

    # Используем trash-put вместо rm
    command -v trash-put >/dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        echo "trash-put не установлен. Установи trash-cli: sudo pacman -S trash-cli"
        return 1
    fi

    trash-put "$@"
}
# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #



source <(fzf --zsh)
eval "fastfetch"
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
source ~/.oh-my-zsh/custom/plugins/fzf-tab/fzf-tab.plugin.zsh

eval $(opam env)

# SSH-agent
if ! pgrep -u "$USER" ssh-agent > /dev/null; then
    eval "$(ssh-agent -s > /dev/null)"
fi



if [ "$(tty)" = "/dev/tty1" -o "$(tty)" = "/dev/tty2"  ] && [ -z "$(printenv HYPRLAND_INSTANCE_SIGNATURE)" ]; then
  exec ~/.local/bin/wlinitrc
fi


fzf_history() {
    local selected=$(fc -rl 1 | sed 's/^[[:space:]]*[0-9]*[[:space:]]*//' | fzf --reverse --height=40%)
    if [[ -n $selected ]]; then
        LBUFFER="$selected"
    fi
}


# Зарегистрируйте функцию как виджет
zle -N fzf_history

# Привяжите Ctrl+S к виджету
bindkey "^S" fzf_history


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
    zle accept-line  # Эмулирует нажатие Enter
}

# Функция для yazi с автопереходом и эмуляцией Enter
y-widget() {
    local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
    yazi "$@" --cwd-file="$tmp"
    if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
        builtin cd -- "$cwd"
        zle reset-prompt
        zle accept-line  # Эмулирует нажатие Enter
    fi
    rm -f -- "$tmp"
}


# Регистрируем функции как виджеты
zle -N fzf-widget
zle -N zi-widget
zle -N y-widget

# Привязываем сочетания клавиш
bindkey '^G' fzf-widget
bindkey '^J' zi-widget
bindkey '^Y' y-widget


mycat() {
    if file --mime-type "$1" | grep -q 'image/'; then
        kitten icat --align left --scale-up "$1"
    else
        command cat "$1"
    fi
}


PATH="/home/alchemmist/perl5/bin${PATH:+:${PATH}}"; export PATH;
PERL5LIB="/home/alchemmist/perl5/lib/perl5${PERL5LIB:+:${PERL5LIB}}"; export PERL5LIB;
PERL_LOCAL_LIB_ROOT="/home/alchemmist/perl5${PERL_LOCAL_LIB_ROOT:+:${PERL_LOCAL_LIB_ROOT}}"; export PERL_LOCAL_LIB_ROOT;
PERL_MB_OPT="--install_base \"/home/alchemmist/perl5\""; export PERL_MB_OPT;
PERL_MM_OPT="INSTALL_BASE=/home/alchemmist/perl5"; export PERL_MM_OPT;

. "$HOME/.local/share/../bin/env"

eval "tmux bind-key s choose-tree -ZsN"
eval "tmux bind-key w choose-tree -ZwN"

source <(eww shell-completions --shell zsh)
