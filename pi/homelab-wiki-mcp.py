import os
from pathlib import Path
import runpy
import sys

root = Path.home() / "code/homelab"
proxy = Path.home() / ".antex/venvs/grafana-mcp/bin/mcp-proxy"
url = "https://wiki.alchemmist.xyz/mcp"

if Path(os.getcwd()).resolve().is_relative_to(root.resolve()):
    os.execv(str(proxy), [str(proxy), "--transport", "streamablehttp", "--log-level", "WARNING", "--verify-ssl", "false", url])

gate = runpy.run_path(str(Path.home() / ".antex/bin/arcadia-mcp-gate.py"))
gate["empty_server"](sys.stdin.buffer, sys.stdout)
