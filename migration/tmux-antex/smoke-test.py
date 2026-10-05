#!/usr/bin/env python3
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
import uuid


def main():
    tmux = shutil.which("tmux")
    lazy = shutil.which("lazy-tmux")
    if not tmux or not lazy:
        raise SystemExit("Install tmux and lazy-tmux first")
    socket = "migration-smoke-" + uuid.uuid4().hex
    with tempfile.TemporaryDirectory(prefix="migration-smoke-") as directory:
        root = Path(directory).resolve()
        log = root / "resumed.json"
        agent_home = root / "agent"
        agent_home.mkdir()
        thread = str(uuid.uuid4())
        fake = root / "antex"
        fake.write_text(
            "#!/bin/sh\n"
            + "printf '%s\\n' \"$ANTEX_HOME\" \"$@\" > " + shlex.quote(str(log)) + "\n"
            + "exec sleep 30\n"
        )
        fake.chmod(0o700)
        wrapper = root / "tmux-wrapper"
        config = root / "tmux.conf"
        config.write_text("set -g default-shell /bin/sh\nset -g default-command /bin/sh\nset -g base-index 1\nsetw -g pane-base-index 1\n")
        wrapper.write_text("#!/bin/sh\nexec " + shlex.join([tmux, "-L", socket, "-f", str(config)]) + ' "$@"\n')
        wrapper.chmod(0o700)
        data = root / "state"
        (data / "sessions").mkdir(parents=True)
        state = {
            "version": 1, "session_name": "migration-test", "current_window": 1, "current_pane": 1,
            "windows": [{"index": 1, "name": "agent", "layout": "", "is_active": True, "active_pane": 1,
                "panes": [{"index": 1, "current_path": str(root), "current_cmd": "antex", "restore_cmd": "antex", "is_active": True,
                    "meta": {"antex.session_id": thread, "antex.session_id_source": "binding-v1", "antex.home": str(agent_home),
                        "antex.resume_argv": json.dumps(["antex", "resume", thread, "--cd", str(root)])}}]}],
        }
        (data / "sessions/migration-test.json").write_text(json.dumps(state))
        cfg = root / "lazy.toml"
        cfg.write_text('restore_timeout = "0s"\n')
        environment = dict(os.environ, PATH=str(root) + os.pathsep + os.environ["PATH"], LAZY_TMUX_CONFIG=str(cfg))
        environment.pop("TMUX", None)
        try:
            result = subprocess.run([lazy, "restore", "--session", "migration-test", "--switch=false", "--data-dir", str(data), "--tmux-bin", str(wrapper)], env=environment, capture_output=True, text=True, timeout=20)
            if result.returncode:
                raise RuntimeError(result.stderr)
            deadline = time.monotonic() + 10
            while not log.exists() and time.monotonic() < deadline:
                time.sleep(0.1)
            actual = log.read_text().splitlines()
            if actual[:3] != [str(agent_home), "resume", thread]:
                raise RuntimeError("Restored the wrong agent home or thread ID")
            print("Isolated tmux restore resumed the exact saved thread ID and agent home using a stub; no real agent was started.")
        finally:
            subprocess.run([tmux, "-L", socket, "kill-server"], capture_output=True)


if __name__ == "__main__":
    main()
