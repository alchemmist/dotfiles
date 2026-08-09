#!/bin/sh
# Фоновый сбор ВСЕЙ arc-части промпта одним проходом. Вызывается из precmd
# отцеплено (&!), поэтому медленные `arc status/diff` на FUSE НЕ блокируют рендер.
# Пишет по файлу на сегмент; starship-модули их просто `cat`-ают (мгновенно).
# Переиспользует существующие хелперы — глифы не дублируются здесь.
#
#   arc-refresh.sh <root> <base>
#     пишет <base>.{branch,pr,state,status,metrics,ahead,behind}

root="$1"; base="$2"
[ -n "$root" ] && [ -n "$base" ] || exit 0

# Лок: не плодим параллельные рефрешеры. mkdir атомарен; снимаем на выходе.
lock="$base.lock"
mkdir "$lock" 2>/dev/null || exit 0
trap 'rmdir "$lock" 2>/dev/null' EXIT INT TERM

cd "$root" 2>/dev/null || exit 0
D="$HOME/.config/starship"

w() {  # w <seg> <value> — атомарная запись сегмента
  printf '%s' "$2" > "$base.$1.tmp" 2>/dev/null && mv "$base.$1.tmp" "$base.$1" 2>/dev/null
}

info=$(arc info 2>/dev/null)
branch=$(printf '%s\n' "$info" | sed -n 's/^branch: //p')
w branch "$branch"

# PR (review-request Arcanum): arc-pr.py сам пишет $base.pr
"${STEFANIA_PYTHON:-python3}" "$D/arc-pr.py" refresh "$root" "$branch" "$base" 2>/dev/null

# Остальные сегменты — через существующие хелперы (в них живут глифы)
w state   "$("$D/arc_state.sh"        2>/dev/null)"
w status  "$("$D/arc_status.sh"       2>/dev/null)"
w metrics "$("$D/arc_metrics.sh"      2>/dev/null)"
w ahead   "$("$D/arc_dots.sh" ahead   2>/dev/null)"
w behind  "$("$D/arc_dots.sh" behind  2>/dev/null)"
