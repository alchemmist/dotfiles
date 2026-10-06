# Restore the Mac setup

The macOS Dotter preset includes the shared desktop configuration, shell startup
files, Karabiner, htop, GitHub CLI preferences, Graphite, Fish integration,
OpenCode configuration and plugins, and container registry preferences.
Alacritty already matches its tracked configuration.

`dotter deploy` also installs missing Homebrew packages from `macos/Brewfile`,
prepares a standalone Python 3.12 environment for agent tools, restores the
selected Stefania skills and MCP client, imports KIT into Antex, enables the
Finder sidebar, and registers the login services. Existing GUI apps and running
services are preserved. Failed prerequisites are reported as an incomplete
deployment; fix them and rerun the same command.

The `org.alchemmist.arcadia-mount` LaunchAgent mounts the registered `~/arcadia`
working copy after login, preserving its existing store and branch. It retries
failed starts every 30 seconds and leaves an already mounted working copy alone.
The mount runs in the foreground under launchd. Logs are in
`~/.local/state/arcadia-mount/`; credentials are loaded from the private shell
files. Extra Arc worktrees are mounted separately when needed. The pre-deploy
hook renders LaunchAgent paths for the current home directory and the post-deploy
hook creates their log directories before registration.

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
`~/.agents/skills`. `macos/stefania-skills.txt` records the 47 migrated Stefania
and Graphify skills. `scripts/restore-stefania.py` uses the official Stefania
installers from `~/arcadia/zootopia/analytics/ml/stefania` to restore missing
skills, shared references, runtime modules, and the MCP client. Existing skill
copies and personal agent instructions are preserved. No corporate skill
contents or credentials are committed to this repository.

Each agent has a tracked `settings.public.json`. Secret environment values are
kept in `.private/agent-settings/<agent>/secrets.json`. The pre-deploy hook merges
these into `.private/agent-settings/<agent>/settings.json`; tracked templates
then deploy that JSON to `~/.<agent>/settings.json` without interpreting its
contents as another template. This also works on the first deployment, before
any generated files exist. The template cache is private and live settings have
mode `0600`. No secret values belong
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

KIT AISuite is installed under `~/.antex/aisuite/kit` and imported into the
global Antex configuration, hooks, rules, and skills. The KIT instructions apply
to KIT/yastore work in any Arcadia mount. Arc mounting does not create agent
configuration in the working copy. Update the home installation with:

```sh
~/.venvs/stefania/bin/python ~/scripts/ensure-kit-aisuite.py --refresh
```

The adapter generates into its home directory, isolates AISuite's Codex metadata,
preserves unrelated Antex settings, and rejects conflicting edits to managed
entries. AISuite's project auto-setup hook is omitted so it cannot recreate
project configuration. Run `make test-kit-aisuite` after changing the adapter.

## Deploy

Clone recursively to include the Neovim submodule. Install Homebrew and Dotter
first. Install Antex separately. Corporate Arc and Skotty must be installed and authenticated separately;
approve macFUSE in macOS and mount `~/arcadia` once before the agent setup can
complete. Restore private shell credentials or sign in again. macOS app
permissions and service accounts cannot be restored from Git. Some preserved
agent and plugin paths assume the macOS username `antonmoss`; review them for a
different username.

Select the preset and deploy:

```sh
cp .dotter/macos.toml .dotter/local.toml
dotter deploy
```

Back up existing destinations before replacing conflicting regular files with
links. Avoid a blanket force deployment. Dotter may print file differences during
preview, including secrets in an old destination, so keep its output private.
The iTerm2 AppSupport link points into `~/Library/Application Support/iTerm2`;
that application data must be migrated separately.

Podman VM state, Syncthing device pairing, saved window positions, agent session
histories, private `~/.config/yastore/tvmtool.env`, and the corporate CA at
`~/.ssl/certs/YandexInternalRootCA.pem` are separate machine data.
The shell tolerates a missing Podman VM or TVM file during initial setup.
Package installation does not replace those data or request new credentials.

## Verify

```sh
make test-agent-settings
make test-kit-aisuite
make test-macos-deploy
~/.venvs/stefania/bin/python scripts/restore-stefania.py --check
git diff --check
```

Confirm that `.private/`, shell credentials, and authentication files remain
ignored before staging. This preset preserves configuration; it does not back up
the full contents of `.antex`, `.codex`, or `.claude` to Git.
