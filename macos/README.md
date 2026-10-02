# Restore the Mac setup

The macOS Dotter preset includes the shared desktop configuration, shell startup
files, Karabiner, htop, GitHub CLI preferences, Graphite, Fish integration,
OpenCode configuration and plugins, and container registry preferences.
Alacritty already matches its tracked configuration.

## Private data

Transfer `.private/` separately using secure storage. It is ignored by Git and
is not included in a clone. The migration snapshot preserves the original shell
files and `.config`, except runtime sockets and reproducible `node_modules`.
Symlinks are preserved as links, not copies of their targets.

On the destination Mac, restore the shell credentials before deploying:

```sh
mkdir -p "$HOME/.config/shell"
chmod 700 "$HOME/.config/shell"
install -m 600 .private/migration-2026-10-02/secrets.zsh "$HOME/.config/shell/secrets.zsh"
install -m 600 .private/migration-2026-10-02/secrets-after-customize.zsh "$HOME/.config/shell/secrets-after-customize.zsh"
```

Keep credentials, registry authentication, Graphite authentication, GitHub host
credentials, Podman machine connections, local databases, and generated state
private. Restore needed files from the snapshot or sign in again. The old Neovim
`lazy-lock.json` is retained privately; the Neovim submodule owns its current
configuration and package lock.

## Agent configuration

Antex and Codex TOML configuration, instruction files, hooks, and workflow scripts
are linked individually. Claude instructions, hooks, and commands are linked too.
The shared custom skills remain managed by the existing post-deploy hook under
`~/.agents/skills`. Installed Stefania skills are preserved in the private agent
snapshot; reinstall them through Stefania or restore the saved copies.

Each agent has a tracked `settings.public.json`. Secret environment values are
kept in `.private/agent-settings/<agent>/secrets.json`. The pre-deploy hook merges
these into `.private/agent-settings/<agent>/settings.json`; the live
`~/.<agent>/settings.json` points to that generated file. No secret values belong
in the public file. Without private secrets, rendering preserves the public
preferences and leaves authentication to the environment or a new sign-in.

After changing agent settings through an application, capture them before the
next deployment or commit:

```sh
python3 scripts/sync-agent-settings.py capture
```

This saves public preferences to the repository and secret environment values to
`.private/`. It does not capture authentication stores, session histories, SQLite
databases, approval-rule history, or plugin caches. Keep those in the existing
agent directories and migrate them separately if their history is needed.
The migration snapshot also retains the original agent configuration and skills.

## Deploy

Clone recursively to include the Neovim submodule. Install Dotter, Python 3, and
the referenced applications and tools first. Some preserved agent and plugin
paths assume the macOS username `antonmoss`; review them for a different username.

Select the preset and render private settings:

```sh
cp .dotter/macos.toml .dotter/local.toml
python3 scripts/sync-agent-settings.py render
dotter deploy
```

Back up existing destinations before replacing conflicting regular files with
links. Avoid a blanket force deployment. Dotter may print file differences during
preview, including secrets in an old destination, so keep its output private.
The iTerm2 AppSupport link points into `~/Library/Application Support/iTerm2`;
that application data must be migrated separately.

## Verify

```sh
make test-agent-settings
git diff --check
```

Confirm that `.private/`, shell credentials, and authentication files remain
ignored before staging. This preset preserves configuration; it does not back up
the full contents of `.antex`, `.codex`, or `.claude` to Git.
