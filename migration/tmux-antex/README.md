# Move tmux and agent sessions to another Mac

This directory contains the migration script. `archives/` and `.rehearsal/` are
ignored by Git. Transfer the complete timestamped archive directory, including
`manifest.json`, through private storage. Archives contain conversation history,
terminal scrollback, authentication material, and local configuration.

## Capture on the old Mac

```sh
python3 migration/tmux-antex/migrate.py backup
```

The script copies the saved lazy-tmux store and refreshes all running sessions
in that private copy, with up to 50,000 scrollback lines per shell pane. It does
not close sessions or overwrite the live store.

It archives:

- The configured lazy-tmux data directory: index, session layouts, bindings, and scrollback.
- `~/.local/share/lazy-tmux-backups`.
- `~/.antex`, `~/.codex`, `~/.claude`, and `~/.claude.json`.
- The lazy-tmux configuration, `.tmux.conf`, and `.tmux` plugins.
- The current lazy-tmux and Antex executables. The Antex package and its helper binaries are preserved inside `.antex`.

Agent profiles include rollout JSONL files, SQLite state and paginated history,
memories, goals, authentication files, settings, workflows, and installed plugin
data. SQLite files use the online backup API, including committed WAL contents;
WAL and SHM files themselves are not copied. JSONL files are captured only through
the last complete line observed when each file is opened. Symlinked configuration
is materialized so it does not depend on the old dotfiles checkout. The Antex
launcher is relinked to the bundled package to retain its companion executables.

Runtime sockets, locks, temporary directories, diagnostics logs, and reproducible
`node_modules` are omitted. Every omission is listed in the private manifest.
Working repositories, Arc stores and mounts, SSH keys, Keychain entries, and
external tool installations are not part of this session-state archive.

A live capture is not a process-memory checkpoint or a transaction across all
applications. Stop active agent turns and refresh the backup immediately before
the move. Background processes and in-flight tool executions cannot continue
from their old operating-system process state; agents resume saved conversations.

## Verify and rehearse

```sh
python3 migration/tmux-antex/migrate.py restore /path/to/bundle --into /path/to/new-empty-test-directory
```

This verifies archive and individual-file SHA-256 hashes, safely extracts files,
checks SQLite integrity, and writes `verification.json` beside the archives.
The test destination must not exist. No live state is replaced, and no agent is
started. The report lists session names, bound conversation IDs, missing history,
unverified identities, and working directories.

## Restore on the new Mac

Use the same home path and CPU architecture as recorded in `manifest.json`.
The script deliberately refuses to rewrite paths inside conversation history or
SQLite databases. Install Python 3.11+, tmux, and the runtime tools required by
your dotfiles and agent hooks. Put `~/.local/bin` on `PATH`.

Restore repositories, worktrees, Arc mounts, dotfiles, and required Stefania/hook
support separately. Keep their original paths. Missing working directories are
reported; creating empty replacements would not recover their source code.
Close all agent processes and tmux before replacing their state. Run these
commands from a normal terminal, not from a session being replaced:

```sh
python3 migration/tmux-antex/migrate.py restore /path/to/bundle
python3 migration/tmux-antex/migrate.py restore /path/to/bundle --apply
```

The first command verifies archives without installation. The second refuses
existing destinations. If the new Mac already has fresh profiles, use:

```sh
python3 migration/tmux-antex/migrate.py restore /path/to/bundle --apply --replace
```

Existing destinations are moved into a timestamped `.session-migration-rollback-*`
directory before replacement. A failed installation rolls completed replacements
back. This is not a merge with conversations created on the new Mac. Keep the
rollback directory until the recovered setup is confirmed. Authentication may
need to be renewed on the new device even though local auth files are retained.

## Resume sessions

Native lazy-tmux restores one session at a time:

```sh
lazy-tmux list
lazy-tmux restore --session arcadia --switch=false
```

For all sessions whose agent bindings and working directories pass preflight:

```sh
python3 migration/tmux-antex/migrate.py restore-sessions /path/to/bundle --all
```

Already running sessions are skipped. Sessions with missing directories or
unverified agent identities are reported and left untouched; the command returns
a nonzero status if any session needs review. The picker still contains all saved
sessions. Use `verification.json` to review historical panes. For a known
conversation, resume its exact ID in the intended pane and save that session again:

```sh
antex resume CONVERSATION_ID
lazy-tmux save --session SESSION_NAME
```

Do not guess an ID from a working directory. A historical snapshot can refer to a
conversation already deleted before capture; keeping the snapshot cannot recover
absent history. The migration script never silently invents or changes a binding.

## Development checks

```sh
make test-session-migration
make test-session-migration-smoke
```

The smoke check starts a separate tmux server and a fake agent, verifies the exact
resume ID and agent home, and then kills only that test server. It does not launch
a real conversation or contact an AI service.
