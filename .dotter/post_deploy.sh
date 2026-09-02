#!/bin/sh

set -eu

repo_root=$(git -C "$PWD" rev-parse --show-toplevel)
skills_root="$HOME/.agents/skills"

/bin/mkdir -p "$skills_root"

for skill in arc-worktrees grill-me grilling impeccable rebase; do
    source="$repo_root/codex/skills/$skill"
    if [ ! -f "$source/SKILL.md" ]; then
        echo "Missing skill source: $source/SKILL.md" >&2
        exit 1
    fi
done

for skill in arc-worktrees grill-me grilling impeccable rebase; do
    source="$repo_root/codex/skills/$skill"
    target="$skills_root/$skill"
    if [ -L "$target" ]; then
        /bin/rm -- "$target"
    elif [ -e "$target" ]; then
        echo "Refusing to replace non-symlink target: $target" >&2
        exit 1
    fi
    /bin/ln -s "$source" "$target"
done
