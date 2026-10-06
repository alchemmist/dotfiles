import copy
import hashlib
import json
import re
import shlex

EVENT_NAMES = {
    'PreToolUse': 'pre_tool_use',
    'PermissionRequest': 'permission_request',
    'PostToolUse': 'post_tool_use',
    'PreCompact': 'pre_compact',
    'PostCompact': 'post_compact',
    'SessionStart': 'session_start',
    'SessionEnd': 'session_end',
    'UserPromptSubmit': 'user_prompt_submit',
    'SubagentStart': 'subagent_start',
    'SubagentStop': 'subagent_stop',
    'Stop': 'stop',
    'Interrupt': 'interrupt',
}
MATCHER_EVENTS = {
    'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PreCompact',
    'PostCompact', 'SessionStart', 'SessionEnd', 'SubagentStart', 'SubagentStop',
}
CONTEXT_EVENTS = {'PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'SubagentStart'}
MANAGED_ENV_KEYS = ('FROM_AI_AGENT', 'BASH_ENV', 'ENV', 'ZDOTDIR')
SHELL_WORD = r'''(?:[^\s'"\\]|\\.|'[^']*'|"(?:\\.|[^"\\])*")+'''
PARAMS_PATTERN = re.compile(r'(?<!\S)--params(?:[ \t]+|=)(?P<value>' + SHELL_WORD + ')')


def hook_hash(event, group, handler):
    timeout = int(handler.get('timeout', handler.get('timeout_sec', 1 if event in ('SessionEnd', 'Interrupt') else 600)))
    timeout = max(1, min(timeout, 3)) if event in ('SessionEnd', 'Interrupt') else max(1, timeout)
    identity_handler = {
        'type': handler.get('type', 'command'),
        'timeout': timeout,
    }
    if identity_handler['type'] == 'command':
        identity_handler.update(command=handler['command'], **{'async': bool(handler.get('async', False))})
    elif identity_handler['type'] == 'mcp_tool':
        identity_handler.update(server=handler['server'], tool=handler['tool'], input=handler.get('input') or {})
    else:
        return None
    status = handler.get('statusMessage', handler.get('status_message'))
    if status is not None:
        identity_handler['statusMessage'] = status
    limit = handler.get('additionalContextLimit', handler.get('additional_context_limit'))
    if event in CONTEXT_EVENTS and limit is not None and int(limit) != 2500:
        identity_handler['additionalContextLimit'] = int(limit)
    identity = {'event_name': EVENT_NAMES[event], 'hooks': [identity_handler]}
    if event in MATCHER_EVENTS and group.get('matcher') is not None:
        identity['matcher'] = str(group['matcher'])
    payload = json.dumps(identity, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return 'sha256:' + hashlib.sha256(payload.encode()).hexdigest()


def global_command(command):
    match = PARAMS_PATTERN.search(command)
    if match is None:
        return command
    params = json.loads(shlex.split(match.group('value'))[0])
    if '_search_scope' not in params:
        return command
    params['_search_scope'] = {'additional_directories': []}
    replacement = '--params ' + shlex.quote(json.dumps(params, separators=(',', ':')))
    return command[:match.start()] + replacement + command[match.end():]


def merge_runtime(config, existing_hooks, generated_config, generated_hooks, home_path, previous_env=None):
    config = copy.deepcopy(config)
    result = copy.deepcopy(existing_hooks)
    hook_groups = result.setdefault('hooks', {})
    for event, groups in list(hook_groups.items()):
        kept = []
        for group in groups:
            remaining = [
                handler for handler in group.get('hooks', [])
                if not handler.get('__kit_aisuite')
                and not (
                    str(handler.get('__generator', '')).startswith('ya_tool_aisuite')
                    and any('--name ' + name in handler.get('command', '') for name in ('aisuite_check', 'session_state_gc'))
                )
            ]
            if remaining:
                kept.append({**group, 'hooks': remaining})
        hook_groups[event] = kept
    for event, groups in generated_hooks.get('hooks', {}).items():
        for group in groups:
            handlers = []
            for handler in group.get('hooks', []):
                command = handler.get('command', '')
                if '--name aisuite_check' in command:
                    continue
                handlers.append({**handler, 'command': global_command(command), '__kit_aisuite': True})
            if handlers:
                hook_groups.setdefault(event, []).append({**group, 'hooks': handlers})
    policy = config.setdefault('shell_environment_policy', {})
    env_set = policy.setdefault('set', {})
    generated_env = generated_config.get('shell_environment_policy', {}).get('set', {})
    previous_env = previous_env or {}
    for key in MANAGED_ENV_KEYS:
        if key in generated_env:
            if key in env_set and env_set[key] != generated_env[key] and env_set[key] != previous_env.get(key):
                raise ValueError('Existing shell environment setting requires review: ' + key)
            env_set[key] = generated_env[key]
        elif key in previous_env and key in env_set:
            if env_set[key] != previous_env[key]:
                raise ValueError('Existing shell environment setting requires review: ' + key)
            del env_set[key]
    scope = json.dumps({'additional_directories': []}, separators=(',', ':'))
    if 'AISUITE_SEARCH_SCOPE' in env_set and json.loads(env_set['AISUITE_SEARCH_SCOPE']) != json.loads(scope):
        raise ValueError('Existing AISuite search scope requires review')
    env_set['AISUITE_SEARCH_SCOPE'] = scope
    states = config.setdefault('hooks', {}).setdefault('state', {})
    source = str(home_path / 'hooks.json')
    prior = {}
    for event, groups in existing_hooks.get('hooks', {}).items():
        if event not in EVENT_NAMES:
            continue
        for group_index, group in enumerate(groups):
            for handler_index, handler in enumerate(group.get('hooks', [])):
                key = f'{source}:{EVENT_NAMES[event]}:{group_index}:{handler_index}'
                digest = hook_hash(event, group, handler)
                if key in states and digest is not None:
                    prior.setdefault((event, digest), []).append(dict(states[key]))
    for key in list(states):
        if key.startswith(source + ':'):
            del states[key]
    for event, groups in hook_groups.items():
        if event not in EVENT_NAMES:
            continue
        for group_index, group in enumerate(groups):
            for handler_index, handler in enumerate(group.get('hooks', [])):
                digest = hook_hash(event, group, handler)
                previous_states = prior.get((event, digest), [])
                if digest is None or (not handler.get('__kit_aisuite') and not previous_states):
                    continue
                key = f'{source}:{EVENT_NAMES[event]}:{group_index}:{handler_index}'
                states[key] = previous_states.pop(0) if previous_states else {'trusted_hash': digest}
    config.setdefault('features', {})['hooks'] = True
    return config, result
