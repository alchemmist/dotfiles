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
