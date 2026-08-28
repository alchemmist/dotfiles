---
name: arc-worktrees
description: Use when starting work on a separate task — in particular a new ticket that differs from the current branch. Also use when needing isolated workspace for parallel work, multiple agents on different tasks, user working in IDE while agent works separately, or switching between tasks without losing state. A worktree can optionally be scoped to the current project with an `arc mount --path-filter` (selective/sparse checkout, off by default) so it stays small.
---

# Arc Worktrees — Isolated Workspaces in Arcadia

## Overview

Arc worktrees are **multiple `arc mount` points sharing one object-store** — the Arcadia analog of git worktrees. Each mount is an independent FUSE-based virtual filesystem with its own branch, letting multiple agents or a user+agent work in parallel without conflicts.

Worktrees use a **shared object store** (`~/.arc/store/.arc/objects` by default, ~24GB) reused across all mounts. Each worktree adds only ~1-3GB overlay for mount-specific metadata.

**Path conventions below are defaults.** The trunk mount, worktree base, and object-store path are all configurable (via `arc-wt.yaml` or explicit flags). Treat `~/arcadia`, `~/arcadia-wt/<NAME>`, `~/arcadia-worktrees/<NAME>` as examples — use `arc root` to print the current mount and `arc mount --list` to see all configured mounts. If the user has a custom layout, substitute their paths throughout.

**Announce at start:** "Using arc-worktrees skill to set up an isolated workspace."

## When to Use

- Multiple agents working on different tasks simultaneously
- User works in IDE on one task, agent works on another in parallel
- Switching between tasks without stash/checkout dance
- Any time you need a second independent copy of Arcadia

**When NOT to use:**
- Single task, single branch — just work in existing mount
- Only need to switch between PRs — use `arc pr select` instead
- Only need to read code from another branch — use `arc show` instead

## Pre-Flight Checks

Before creating a worktree, always run:

```bash
# 1. List existing mounts — note the object_store field, needed for --object-store below
arc mount --list
# Example output:
# [mounted, pid: 1234] mount: ~/arcadia store: ~/.arc/store object_store: ~/.arc/store/.arc/objects
# [mounted, pid: 5678] mount: ~/arcadia-worktrees/FOO store: ~/.arc/stores/FOO object_store: ~/.arc/store/.arc/objects

# 2. Check disk space
df -h ~

# 3. Check shared object store (path visible in step 1 output above)
du -sh $(arc mount --list --json | jq -r --arg m "$(arc root)" '.[] | select(.mount == $m) | .["object-store"]') 2>/dev/null || echo "No shared object store yet"

# 4. Check current repo and branch
cd $(arc root) && arc info
# Key fields:
#   "repository": "arcadia"   ← pass this as -r to arc mount and arc checkout
#   "branch": "trunk"         ← confirm you're starting from the right base
```

**NEVER create a worktree if disk space < 10GB free.** Each mount adds overlay storage.

## Creating a Worktree

Worktrees use two separate stores:
- `-S <store>` — per-worktree store at `~/.arc/stores/<NAME>` for mount-specific metadata
- `--object-store <path>` — shared object storage, reused across all worktrees. To find the actual path for the current mount: `arc mount --list --json | jq -r --arg m "$(arc root)" '.[] | select(.mount == $m) | .["object-store"]'`
- `-r <repo>` — target repository (`arcadia` by default); required when working in `cloudia` or another non-default repo — omitting it mounts the wrong repo

First worktree creates the object store (~24GB). Subsequent worktrees reuse it and add only ~1-3GB overlay each.

### Mount

Mount via the bundled wrapper `scripts/arc-pf-mount` — it runs `arc mount` with your args and appends the (gated) path-filter. By default no filter is added (full-repo mount); it is added only when the path-filter switch is on (see below). **Use the wrapper, not a raw `arc mount ... $FILTERS`:** the filter tokens must be split into separate arguments, and an unquoted `$VAR`/`$(...)` is **not** word-split in zsh (many agents run commands in zsh), which collapses the whole set into one bad argument and the mount fails. The wrapper splits them inside bash, so it works in any shell. (`$SKILL_DIR` is this skill's own directory — substitute its install path.)

```bash
# Ensure store directories exist
mkdir -p ~/.arc/stores/<NAME>
mkdir -p ~/projects/arc_obj_store

# Mount (full repo by default; path-filtered when the switch is on — see below).
# Everything after `--` is passed verbatim to `arc mount`.
"$SKILL_DIR/scripts/arc-pf-mount" -- \
  -m ~/arcadia-worktrees/<NAME> \
  -S ~/.arc/stores/<NAME> \
  --object-store <object-store-path> \
  -r <repository-name>

# Create branch and navigate
cd ~/arcadia-worktrees/<NAME>
arc checkout -b users/<LOGIN>/<NAME>
cd <project/path>
```

> If a **path-filtered** mount hangs and never returns, see Troubleshooting — it does upfront network/FUSE work that can block in a sandboxed / non-TTY shell.

### Path-filter switch (OFF by default)

Path-filtering (`arc mount --path-filter`, experimental selective checkout) scopes the worktree to the **current project** instead of all of Arcadia. It is **OFF by default** — `resolve-path-filter` emits nothing and you get a full-repo mount. The switch is enforced by the resolver itself (not by prose), so it is deterministic. Enable it by **either**:

- **Always-on:** `export ARC_WT_PATHFILTER=1` (e.g. in `~/.zprofile`). Every worktree created via the Mount step is then scoped to the current project automatically.
- **One-off, on explicit request:** when the user asks for a scoped / small / single-project worktree, pass `--force` to the wrapper for this mount:
  ```bash
  "$SKILL_DIR/scripts/arc-pf-mount" --force -- \
    -m ~/arcadia-worktrees/<NAME> -S ~/.arc/stores/<NAME> \
    --object-store <object-store-path> -r <repository-name>
  ```

When enabled, the filter set is: cwd relative to `arc root` (the project path) + per-project overrides from `~/.config/arc-worktrees/path-filters.conf` (longest-prefix match) + always the system paths `ya devtools build .arcadia.root .arcignore junk/$USER` (without them `ya` breaks), deduped. See `path-filters.example.conf`. Env overrides: `ARC_WT_FILTER_CONFIG` (config path), `ARC_WT_ALWAYS` (the always-set).

**path-filter RESTRICTS the working set — it is NOT lazy download.** Paths outside the filter are not materialized, so `ya make` fails if a build dependency is missing. Start with the project path; when a build reports a missing path, add it to the project's line in `path-filters.conf` and widen the live mount in place with `arc checkout --path-filter <path>` (no remount needed). `ls` at the mount root still listing all of Arcadia is normal (virtual FS) — only filtered paths are checked out.

### Naming and path conventions

- **`<NAME>`**: use ticket ID or descriptive slug (`PROJ-12345`, `fix-search-pagination`)
- **Mount path**: `~/arcadia-worktrees/<NAME>` — must be top-level, not a subdirectory of existing mount
- **Branch**: `users/<LOGIN>/<NAME>`

### Verify

```bash
arc info        # confirm branch and repository
# Key fields to check:
#   "repository": "arcadia"          ← must match the -r flag you passed to arc mount
#   "branch": "users/<LOGIN>/<NAME>" ← confirm correct branch
arc status      # confirm clean state
```

Report: "Worktree ready at `~/arcadia-worktrees/<NAME>/<project/path>` on branch `users/<LOGIN>/<NAME>`"

## Remount After Reboot

FUSE mounts do not survive reboots. To restore:

```bash
arc mount -m ~/arcadia-worktrees/<NAME>
```

Note: `arc mount -m` for remount relies on arc's own metadata to restore `-S`, `--object-store`, and `-r` settings — no need to pass them again. An opt-in path-filter is normally persisted too; if a remount comes back with the full tree, re-apply the same `--path-filter` flags you originally used (or recreate via the Mount step with the switch on).

To find which worktrees need remounting after reboot:
```bash
ls ~/arcadia-worktrees/   # directories that existed before reboot
arc mount --list          # currently active mounts
```

## Working in a Worktree

### Committing changes

```bash
arc status                          # see what changed
arc diff                            # review changes
arc add <file1> <file2>             # stage specific files
arc diff --cached                   # verify staged
arc commit -m "<TICKET>: description"
```

### Pushing branch to remote

```bash
arc push -u users/<LOGIN>/<NAME>    # first push: set upstream
arc push                            # subsequent pushes
```

### Switching between worktrees

When switching, preserve your relative path:
```bash
# If you're in ~/arcadia-worktrees/wt1/services/myservice/
# switch to the same location in wt2:
cd ~/arcadia-worktrees/wt2/services/myservice/
```

## Status Checks Before Destructive Operations

Before removing or pruning a worktree, ALWAYS verify:

```bash
cd ~/arcadia-worktrees/<NAME>

# 1. Check for uncommitted changes
arc status --json

# 2. Check for unpushed commits
arc log --oneline trunk..HEAD
```

**arc status --json** key names vary by arc version. Check any of: `clean`, `is_clean`, `working_tree_clean`. Also check `status.changed` array (empty = clean).

For unpushed commits: if `arc log --oneline trunk..HEAD` produces any output, there are unpushed commits.

**NEVER remove a worktree with uncommitted changes or unpushed commits without explicit user confirmation.**

## Cleanup (CRITICAL)

**Every worktree you create MUST be cleaned up.** Store grows with usage and is never auto-cleaned.

### Step 1: Verify work is complete

```bash
cd ~/arcadia-worktrees/<NAME>
arc status          # no uncommitted changes?
arc log --oneline trunk..HEAD   # no unpushed commits?
```

**If uncommitted changes or unpushed commits exist, ask user before proceeding.**

### Step 2: Exit the mount

```bash
# MUST exit the mount first — check CWD
pwd | grep -q "arcadia-worktrees/<NAME>" && cd ~
```

### Step 3: Unmount and remove storage

```bash
arc unmount ~/arcadia-worktrees/<NAME>

# Remove mount registration AND its overlay storage
arc unmount --forget ~/arcadia-worktrees/<NAME>

# Remove empty directory
rmdir ~/arcadia-worktrees/<NAME> 2>/dev/null
```

**`--forget` is irreversible.** Only use after confirming work is pushed/merged.

### Step 4: Clean up per-worktree store

```bash
# Remove per-worktree store (safe after unmount --forget)
rm -rf ~/.arc/stores/<NAME>

# DO NOT delete the shared object store — it is used by other worktrees
```

### Step 5: Garbage-collect shared store

```bash
arc gc              # remove objects that exist on server
arc gc --dry-run    # preview what would be removed
```

### Step 6: Clean up branches and build cache

```bash
cd ~/arcadia
arc checkout trunk
arc br -D --merged                  # delete local merged branches
ya gc cache                         # clean build cache (~/.ya/build)
```

## Pruning Merged Worktrees

Batch cleanup of worktrees whose branches have been merged:

```bash
# Pull latest trunk first
cd ~/arcadia && arc pull trunk

# Get list of merged branches
arc branch --merged --json

# For each worktree in ~/arcadia-worktrees/<NAME>:
#   1. cd ~/arcadia-worktrees/<NAME>
#   2. Check branch is in merged list
#   3. Verify clean status (arc status --json)
#   4. Verify no unpushed commits (arc log --oneline trunk..HEAD — must be empty)
#   5. Only if all three pass: follow cleanup steps above
```

**Safety:** only remove branches present in `arc branch --merged` output. Skip any worktree where the current shell is located inside it.

## Safety Rules

| Rule | Why |
|------|-----|
| Never `grep`/`ya grep` without `--remote` from mount root | Downloads ALL of Arcadia, freezes account |
| Never open mount root in IDE | IDE indexing downloads entire Arcadia via FUSE, freezes account |
| Never `arc push -f` shared branches | Destroys colleagues' work |
| Never `arc unmount --forget` with uncommitted changes | Irreversibly loses work |
| Never `arc reset --hard` without confirming with user | Permanently deletes uncommitted changes |
| Always `cd ~` before `arc unmount` | Can't unmount from inside mount |
| Never `arc checkout`/`arc stash` in user's active mount as a workaround | Kills FUSE daemon, crashes IDE, loses work |
| Never delete `~/.arc/stores/<NAME>` while worktree is still mounted | Corrupts mount state |
| Never delete shared object store (`~/projects/arc_obj_store`) | Shared by all worktrees |
| After reboot, remount worktrees before accessing them | FUSE mounts don't survive restarts |


## Quick Reference

| Action | Command |
|--------|---------|
| List mounts | `arc mount --list` |
| Create worktree (full or path-filtered) | `"$SKILL_DIR/scripts/arc-pf-mount" [--force] -- -m <path> -S ~/.arc/stores/<NAME> --object-store <obj> -r <repo>` |
| Enable path-filter by default | `export ARC_WT_PATHFILTER=1` |
| Inspect resolved filters for cwd | `"$SKILL_DIR/scripts/resolve-path-filter" --force` (off → empty) |
| Widen filter on live mount | `arc checkout --path-filter <path>` |
| Edit per-project filters | `~/.config/arc-worktrees/path-filters.conf` |
| Remount after reboot | `arc mount -m <path>` |
| Unmount | `arc unmount <path>` |
| Unmount + delete storage | `arc unmount --forget <path>` |
| Create branch | `arc checkout -b users/<login>/<name>` |
| Check clean status | `arc status --json` |
| Check unpushed commits | `arc log --oneline trunk..HEAD` |
| GC object store | `arc gc` |
| GC build cache | `ya gc cache` |
| Clean merged branches | `arc br -D --merged` |
| Check object store size | `du -sh ~/projects/arc_obj_store` |
| Check worktree stores size | `du -sh ~/.arc/stores/*` |

## Disk Usage Reference

| Location | What | Size | Cleanup |
|----------|------|------|---------|
| `~/projects/arc_obj_store` | Shared object store (used by all worktrees) | ~24GB | `arc gc` — DO NOT delete manually |
| `~/.arc/stores/<NAME>` | Per-worktree store | ~1-3GB | `rm -rf` after `unmount --forget` |
| `~/.arc/store/` | Default store (main `~/arcadia` mount) | varies | `arc gc` |
| `~/.ya/build/` | Build cache | varies | `ya gc cache` |
| `~/.arc/traces/` | Command logs | small | Auto-cleaned (30-day TTL) |

## Troubleshooting

### Account frozen after mount creation
Arc FUSE downloads files on demand. If IDE or grep traverses the tree, massive traffic triggers account freeze. Go to Arcanum, click "Everything is OK, it's me", explain in SECALERTS ticket.

### `arc unmount` fails
1. Check no process uses the mount: `lsof +D ~/arcadia-worktrees/<NAME>`
2. Try force unmount: `arc unmount -f ~/arcadia-worktrees/<NAME>`
3. If still fails (stale FUSE mount on macOS): `diskutil unmount force ~/arcadia-worktrees/<NAME>`

### Worktree not accessible after reboot
FUSE mounts don't survive reboots. Remount: `arc mount -m ~/arcadia-worktrees/<NAME>`.

### Disk space running out
```bash
du -sh ~/projects/arc_obj_store   # shared object store
du -sh ~/.arc/stores/*            # per-worktree stores
du -sh ~/.arc/store               # default store (main mount)
arc gc                            # clean unreferenced objects
ya gc cache                       # clean build cache
arc mount --list                  # find forgotten mounts
# unmount --forget any unused mounts
```

### arc status --json returns unexpected keys
Arc versions use different key names for clean status: `clean`, `is_clean`, `working_tree_clean`. For up-to-date: `up_to_date`, `is_up_to_date`, `uptodate`, `trunk_up_to_date`. Also check `status.changed` array (empty = clean).

### Orphan `~/.arc/stores/<NAME>` without corresponding mount
If `arc mount --list` doesn't show a worktree but `~/.arc/stores/<NAME>` exists, the store is orphan (from an incomplete cleanup). Safe to `rm -rf ~/.arc/stores/<NAME>` after confirming the worktree is really gone.

### Shell completion stale after arc update
```bash
arc completion zsh > ~/.zfunc/_arc    # regenerate
```

### `ya make` fails with a missing path in a path-filtered worktree
The dependency lives outside the current filter. Add it to the project's line in
`~/.config/arc-worktrees/path-filters.conf` and widen the live mount in place:
```bash
arc checkout --path-filter <missing/path>
```
Re-run the build; repeat until all deps are materialized.

### `resolve-path-filter` says "at mount root" or "not inside an arc mount"
Run it from **inside** an arc mount, in the project subdirectory you want to scope to
(not at the mount root). Or pass an explicit project path (with `--force`, since the switch may be off):
`resolve-path-filter --force some/project`.

### Worktree mounted the whole repo despite wanting a path-filter
Most likely the switch is OFF (the default): the path-filter is added only with
`export ARC_WT_PATHFILTER=1` (always-on) or `arc-pf-mount --force` (one-off) — otherwise a
full mount is correct. If you DID enable it and still got a full mount, run
`"$SKILL_DIR/scripts/resolve-path-filter" --force` and confirm it prints a non-empty set,
and that the project has an entry (or a sane fallback) in `path-filters.conf`. `ls` showing
the full tree is normal regardless.

### Path-filtered `arc mount` hangs / never returns
A path-filtered mount does **upfront** network + FUSE work to materialize the filtered paths
(a plain lazy mount does not — which is why it succeeds instantly). In a sandboxed or
non-TTY shell — e.g. an automated agent's shell with restricted network — that upfront work
can block indefinitely, even though the exact command runs in a second in a real terminal.
Run the path-filtered mount in an interactive terminal (or with the agent's shell sandbox
disabled). A plain full mount is unaffected. A failed/interrupted attempt usually leaves no
mount — verify with `arc mount --list` / `ls ~/arcadia-worktrees/`.
