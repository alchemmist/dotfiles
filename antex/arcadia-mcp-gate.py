import json
import os
from pathlib import Path
import subprocess
import sys

ARC = '/Users/antonmoss/.local/bin/arc'
MAX_MESSAGE_BYTES = 1024 * 1024


def arcadia_root(cwd):
    try:
        result = subprocess.run([ARC, 'root'], cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=4, text=True)
        if result.returncode:
            return None
        value = result.stdout.strip()
        root = Path(value)
        current = Path(cwd).resolve()
        if not value or not root.is_absolute() or root == Path('/'):
            return None
        root = root.resolve()
        return str(root) if current.is_relative_to(root) else None
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def empty_server(source, output):
    while True:
        line = source.readline(MAX_MESSAGE_BYTES + 1)
        if not line:
            return
        if len(line) > MAX_MESSAGE_BYTES:
            return
        try:
            message = json.loads(line)
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(message, dict) or 'id' not in message:
            continue
        method = message.get('method')
        if method == 'initialize':
            params = message.get('params') or {}
            result = {'protocolVersion': params.get('protocolVersion', '2024-11-05'), 'capabilities': {}, 'serverInfo': {'name': 'arcadia-only-mcp', 'version': '1.0.0'}}
        elif method == 'ping':
            result = {}
        elif method in ('tools/list', 'resources/list', 'resources/templates/list', 'prompts/list'):
            key = {'tools/list': 'tools', 'resources/list': 'resources', 'resources/templates/list': 'resourceTemplates', 'prompts/list': 'prompts'}[method]
            result = {key: []}
        else:
            response = {'jsonrpc': '2.0', 'id': message['id'], 'error': {'code': -32601, 'message': 'Yandex MCP is available only inside an Arcadia mount'}}
            output.write(json.dumps(response) + '\n')
            output.flush()
            continue
        output.write(json.dumps({'jsonrpc': '2.0', 'id': message['id'], 'result': result}) + '\n')
        output.flush()


def main():
    args = sys.argv[1:]
    if args[:1] == ['--probe']:
        cwd = args[1] if len(args) > 1 else os.getcwd()
        print(json.dumps({'cwd': cwd, 'arcadia_root': arcadia_root(cwd)}))
        return
    if not args:
        raise SystemExit('Missing MCP server command')
    if arcadia_root(os.getcwd()):
        os.execvpe(args[0], args, os.environ)
    empty_server(sys.stdin.buffer, sys.stdout)


if __name__ == '__main__':
    main()
