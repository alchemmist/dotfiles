import os
from pathlib import Path
import runpy
import sys

root = Path.home() / "code/homelab"
proxy = Path.home() / ".antex/venvs/grafana-mcp/bin/mcp-proxy"
url = "https://wiki.socrat.alchemmist.xyz/mcp"

if Path(os.getcwd()).resolve().is_relative_to(root.resolve()):
    os.execv(str(proxy), [str(proxy), "--transport", "streamablehttp", "--log-level", "WARNING", "--verify-ssl", "false", "--headers", "Authorization", f"Bearer {os.environ['API_ACCESS_TOKEN']}", url])

gate = runpy.run_path(str(Path.home() / ".antex/bin/arcadia-mcp-gate.py"))
gate["empty_server"](sys.stdin.buffer, sys.stdout)
