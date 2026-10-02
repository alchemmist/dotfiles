import argparse
import copy
import json
import os
from pathlib import Path

AGENTS = ("antex", "codex", "claude")
SECRET_ENV_NAMES = ("TOKEN", "SECRET", "PASSWORD", "API_KEY", "APIKEY")


def secret_name(name):
    return any(part in name.upper() for part in SECRET_ENV_NAMES)


def split_settings(settings):
    public = copy.deepcopy(settings)
    env = public.get("env", {})
    secrets = {key: env.pop(key) for key in list(env) if secret_name(key)}
    return public, {"env": secrets}


def merge_settings(public, private):
    if any(secret_name(key) for key in public.get("env", {})):
        raise ValueError("Secret environment keys must stay in the private settings")
    result = copy.deepcopy(public)
    result.setdefault("env", {}).update(private.get("env", {}))
    return result


def write_json(path, value, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if private:
        os.chmod(path.parent, 0o700)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("capture", "render"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args()
    private_root = args.root / ".private"
    private_root.mkdir(exist_ok=True, mode=0o700)
    os.chmod(private_root, 0o700)
    for agent in AGENTS:
        public_path = args.root / agent / "settings.public.json"
        private_path = private_root / "agent-settings" / agent / "secrets.json"
        runtime_path = private_path.with_name("settings.json")
        if args.mode == "capture":
            source = args.home / ("." + agent) / "settings.json"
            if not source.exists():
                continue
            public, private = split_settings(json.loads(source.read_text()))
            write_json(private_path, private, private=True)
            write_json(public_path, public)
        else:
            if not public_path.exists():
                continue
            public = json.loads(public_path.read_text())
            private = json.loads(private_path.read_text()) if private_path.exists() else {}
            write_json(runtime_path, merge_settings(public, private), private=True)


if __name__ == "__main__":
    main()
