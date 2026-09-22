import json
import os
import re
import shlex
import sys

ARC_ROOT = "/Users/antonmoss/arcadia"
SEARCH_COMMAND = re.compile(r"(?:^|[;&|()\s])(?:rg|ripgrep|find|fd|fdfind|grep|egrep|fgrep|ag|ack|tree)(?:\s|$)")
ROOT_ARGUMENT = re.compile(r"(?:^|\s)(?:\.|\$ARCADIA_ROOT|\$\{ARCADIA_ROOT\}|/Users/antonmoss/arcadia/?)(?=\s|$)")


def value(data, *names):
    for name in names:
        item = data.get(name)
        if isinstance(item, str):
            return item
    return ""


def has_explicit_project_path(command, workdir):
    try:
        tokens = shlex.split(command)
    except ValueError:
        return False
    for token in tokens:
        if token.startswith("-") or token in {".", ".."}:
            continue
        candidate = token if os.path.isabs(token) else os.path.join(workdir, token)
        candidate = os.path.realpath(candidate)
        if os.path.isdir(candidate) and candidate.startswith(f"{ARC_ROOT}/"):
            return True
    return False


payload = json.load(sys.stdin)
tool_input = payload.get("tool_input") or payload.get("input") or payload
command = value(tool_input, "command", "cmd")
workdir = value(tool_input, "workdir", "cwd")
is_arc_root = workdir.rstrip("/") == ARC_ROOT
targets_arc_root = bool(ROOT_ARGUMENT.search(command))
is_search = bool(SEARCH_COMMAND.search(command))
has_project_path = has_explicit_project_path(command, workdir) if is_arc_root else False

if is_search and (targets_arc_root or (is_arc_root and not has_project_path)):
    print(json.dumps({
        "permissionDecision": "deny",
        "permissionDecisionReason": "Arcadia root search is blocked. Specify one explicit project subdirectory or use Arcadia code search."
    }))
