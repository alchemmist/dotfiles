#!/bin/sh
set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export DATALENS_INSTALLATION=internal
export DATALENS_API_URL="https://agentproxy.yandex.net/datalens"
export DATALENS_SCHEMA_URL="https://api.datalens.yandex.net/json/"
export DATALENS_OAUTH_TOKEN="${DATALENS_OAUTH_TOKEN:-${DATALENS_TOKEN:-${YA_TOKEN:-}}}"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--use-system-ca"

if [ -z "$DATALENS_OAUTH_TOKEN" ]; then
    printf 'DataLens OAuth token is missing: configure DATALENS_TOKEN or YA_TOKEN.\n' >&2
    exit 1
fi

exec /opt/homebrew/bin/npx --yes @datalens-tech/mcp@0.2.0
