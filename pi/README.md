# Pi

Dotter deploys the reproducible Pi setup into `~/.pi/agent`.

The tracked configuration contains no credentials. Set these environment variables in the private shell environment when using custom providers:

- `LITELLM_API_KEY`
- `CURSOR_API_KEY`
- `ELIZA_API_KEY`
- `GRAFANA_API_TOKEN`
- `HOMELAB_WIKI_API_TOKEN`

The package list in `settings.json` is installed by Pi on startup. The project MCP overrides are linked for `~/code`, `~/arcadia/yastore`, and `~/code/homelab`.

`themes/antex-terminal.json` keeps the terminal ANSI palette while using Antex-like semantic roles: green accents, yellow model/tool emphasis, cyan links, and magenta code/stash accents.

`extensions/arcadia-mcp-gate.ts` registers the AISuite/Yandex MCP inventory only when Pi starts inside `~/arcadia/**`; Kitsql is added only below `~/arcadia/yastore/**`. Outside Arcadia those servers are absent from Pi's context.

## KIT backend-go rules

The user-level `extensions/kit-backend-rules.ts` extension injects the complete
contents of `rules/kit-backend-go/*.md` into the structured system prompt before
each run in the directories configured by `kit-backend-rules.json`. The default
scope covers `~/arcadia/yastore/**` and `~/arcadia-worktrees/<branch>/yastore/**`;
other projects receive no KIT rules. Keep the per-file `paths` scopes when applying
the rules. `/kit-rules` lists the active files without relying on a model response.

The rule files are a snapshot of the AISuite `kit/backend-go` preset's canonical
rules, not an automatically synchronized copy. Update them deliberately when the
preset changes. Adjust the absolute paths in `settings.json` and
`kit-backend-rules.json` when installing on a different machine.

Dotter links both the rules directory and its configuration into `~/.pi/agent`.
No `.pi` directory is needed inside yastore. Restart Pi or run `/reload` after
deployment. AISuite's Claude-specific hooks are not installed by this extension.
