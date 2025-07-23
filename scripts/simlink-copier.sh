#!/bin/bash

# Create destination directory
mkdir -p trans

# Walk all files recursively
find . -type f,l ! -path "./trans/*" | while read -r file; do
    # Skip files inside the trans directory
    [[ "$file" == ./trans/* ]] && continue

    if [ -L "$file" ]; then
        # It's a symlink — resolve to target
        target=$(readlink -f "$file")
        if [ -f "$target" ]; then
            cp -u "$target" "trans/$(basename "$target")"
        fi
    elif [ -f "$file" ]; then
        # Regular file
        cp -u "$file" "trans/$(basename "$file")"
    fi
done

