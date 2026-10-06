#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parent.parent
MANIFEST = REPOSITORY / "macos/stefania-skills.txt"
AUTOMATIONS = ("stefania-memory", "stefania-bug-hook")
GRAPHIFY_PACKAGE = "graphifyy==0.9.37"
CORE_FILES = (
    "agent-core/CLAUDE.md",
    "agent-core/references/skills-catalog.md",
    "agent-core/references/safety.md",
    "agent-core/references/workflows.md",
    "scripts/setup/install_global_agent_core.py",
    "scripts/setup/_lib_customize.py",
    "scripts/common/_env.py",
    "scripts/common/kb_config.py",
    "scripts/common/kb_registry.py",
    "scripts/common/secret_names.py",
    "scripts/common/customize_io.py",
)
MCP_FILES = (
    "bin/mcp",
    "bin/client.json",
    "connect.py",
    "proxy.py",
    "healthcheck.py",
    "local_exports.py",
    "server_catalog.py",
    "registry.json",
)
HOOK_FILES = (
    "stefania-memory/hooks/stop.py",
    "stefania-memory/hooks/pre-compact.py",
    "stefania-memory/hooks/user-prompt-submit.py",
    "stefania-bug-hook/hooks/user-prompt-submit.py",
)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Restore the selected Stefania skills and shared runtime without replacing agent rules."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=Path(
            os.environ.get(
                "STEFANIA_PROJECT_DIR",
                str(Path.home() / "arcadia/zootopia/analytics/ml/stefania"),
            )
        ),
        help="Stefania project root containing agent-core, scripts and skills",
    )
    parser.add_argument(
        "--python",
        type=Path,
        default=Path.home() / ".venvs/stefania/bin/python",
        help="Prepared Stefania Python 3.12+ virtual environment",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check installed files and runtimes without changing them",
    )
    return parser.parse_args()


def selected_skills() -> list[str]:
    return [
        name for line in MANIFEST.read_text().splitlines() if (name := line.strip())
    ]


def skill_roots() -> dict[str, Path]:
    return {
        "codex": Path.home() / ".agents/skills",
        "claude": Path.home() / ".claude/skills",
    }


def runtime_works(python: Path) -> bool:
    if not python.is_file():
        return False
    result = subprocess.run(
        [
            str(python),
            "-B",
            "-c",
            (
                "import sys, ssl, sqlite3, pyexpat, tomlkit, json5, websockets, requests, yaml; "
                "assert sys.version_info >= (3, 12)"
            ),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def graphify_python() -> Path | None:
    executable = shutil.which("graphify")
    if executable:
        with Path(executable).open("rb") as stream:
            first_line = stream.readline().decode("ascii", errors="replace").strip()
        if first_line.startswith("#!/"):
            candidate = Path(first_line[2:])
            if candidate.is_file():
                return candidate
    uv = shutil.which("uv")
    if uv:
        result = subprocess.run(
            [uv, "tool", "dir"], capture_output=True, text=True, check=False
        )
        if result.returncode == 0:
            candidate = Path(result.stdout.strip()) / "graphifyy/bin/python"
            if candidate.is_file():
                return candidate
    return None


def graphify_works(python: Path | None) -> bool:
    if python is None:
        return False
    result = subprocess.run(
        [str(python), "-B", "-c", "import graphify.install"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def audit_dependencies() -> list[dict[str, str]]:
    from importlib import metadata

    import yaml

    try:
        from packaging.requirements import Requirement
        from packaging.utils import canonicalize_name
    except ImportError:
        from pip._vendor.packaging.requirements import Requirement
        from pip._vendor.packaging.utils import canonicalize_name

    problems = []
    versions = {}
    isolated_versions = {}
    for root in skill_roots().values():
        pending = list(selected_skills())
        visited = set()
        while pending:
            name = pending.pop()
            if name in visited:
                continue
            visited.add(name)
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
                raise ValueError("Invalid skill dependency name")
            skill_file = root / name / "SKILL.md"
            if not skill_file.is_file():
                problems.append(
                    {
                        "skill": str(skill_file),
                        "field": "requires-skills",
                        "requirement": name,
                    }
                )
                continue
            match = re.match(r"\A---\s*\n(.*?)\n---", skill_file.read_text(), re.DOTALL)
            fields = yaml.safe_load(match.group(1)) if match else {}
            if not isinstance(fields, dict):
                raise TypeError(f"Invalid skill metadata: {skill_file}")
            pending.extend(
                str(fields.get("requires-skills", "")).replace(",", " ").split()
            )
            for field in ("requires-pip", "requires-pip-isolated"):
                declared = str(fields.get(field, ""))
                for value in declared.replace(",", " ").split():
                    requirement = Requirement(value)
                    if requirement.url:
                        raise ValueError(
                            f"Direct package URLs are unsupported: {skill_file}"
                        )
                    if requirement.marker and not requirement.marker.evaluate():
                        continue
                    package = canonicalize_name(requirement.name)
                    if field == "requires-pip":
                        if package not in versions:
                            try:
                                versions[package] = metadata.version(requirement.name)
                            except metadata.PackageNotFoundError:
                                versions[package] = None
                        installed = versions[package]
                    else:
                        if name not in isolated_versions:
                            target = Path.home() / ".cache/stefania/skill-deps" / name
                            isolated_versions[name] = {
                                canonicalize_name(
                                    distribution.metadata["Name"]
                                ): distribution.version
                                for distribution in metadata.distributions(
                                    path=[str(target)]
                                )
                                if distribution.metadata.get("Name")
                            }
                        installed = isolated_versions[name].get(package)
                    if installed is None or not requirement.specifier.contains(
                        installed, prereleases=True
                    ):
                        problems.append(
                            {
                                "skill": str(skill_file),
                                "field": field,
                                "requirement": value,
                                "declared": declared,
                            }
                        )
    return problems


def dependency_issues(python: Path) -> list[dict[str, str]]:
    result = subprocess.run(
        [
            str(python),
            "-B",
            "-c",
            (
                "import importlib.util, json, sys; "
                "spec = importlib.util.spec_from_file_location('restore_stefania', sys.argv[1]); "
                "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); "
                "print(json.dumps(module.audit_dependencies()))"
            ),
            str(Path(__file__).resolve()),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(
            "Cannot audit skill Python dependencies; check installed SKILL.md metadata and pip"
        )
    return json.loads(result.stdout)


def restore_dependencies(python: Path, installer) -> None:
    processed = set()
    for issue in dependency_issues(python):
        field = issue["field"]
        if field not in ("requires-pip", "requires-pip-isolated"):
            continue
        name = Path(issue["skill"]).parent.name
        key = (name, field, issue["declared"])
        if key in processed:
            continue
        processed.add(key)
        if field == "requires-pip":
            success, missing = installer.ensure_pip_packages(
                name, issue["declared"], python_exe=str(python)
            )
        else:
            target = installer.isolated_pip_target(name)
            marker = target / ".stefania-requirements.json"
            if target.is_symlink() or marker.is_symlink():
                raise RuntimeError(
                    f"Refusing to repair isolated dependencies through a symlink: {target}"
                )
            marker.unlink(missing_ok=True)
            success, missing = installer.ensure_isolated_pip_packages(
                name, issue["declared"]
            )
        if not success:
            raise RuntimeError(
                f"Missing Python dependencies for {name}: {', '.join(missing)}"
            )


def check_installation(python: Path, stefania_home: Path) -> int:
    missing = [
        str(stefania_home / name)
        for name in CORE_FILES
        if not (stefania_home / name).is_file()
    ]
    missing.extend(
        str(stefania_home / "mcp" / name)
        for name in MCP_FILES
        if not (stefania_home / "mcp" / name).is_file()
    )
    for root in skill_roots().values():
        expected = [f"{name}/SKILL.md" for name in selected_skills()] + list(HOOK_FILES)
        missing.extend(
            str(root / name) for name in expected if not (root / name).is_file()
        )
    if not runtime_works(python):
        missing.append(f"working Python 3.12+ with Stefania dependencies: {python}")
    else:
        for issue in dependency_issues(python):
            missing.append(
                f"{issue['requirement']} ({issue['field']}, {issue['skill']})"
            )
    if not graphify_works(graphify_python()):
        missing.append("working graphifyy runtime (uv tool install graphifyy==0.9.37)")
    if missing:
        for item in missing:
            print(f"Missing: {item}", file=sys.stderr)
        return 1
    print(
        f"Stefania runtime, MCP client, hooks and {len(selected_skills())} skills are present for Antex and Claude."
    )
    return 0


def install_graphify(python: Path) -> None:
    tool_python = graphify_python()
    if not graphify_works(tool_python):
        uv = shutil.which("uv")
        if not uv:
            raise RuntimeError("uv is required to install the graphifyy runtime")
        subprocess.run(
            [uv, "tool", "install", "--python", str(python), GRAPHIFY_PACKAGE],
            check=True,
        )
        tool_python = graphify_python()
    if not graphify_works(tool_python):
        raise RuntimeError(
            "graphifyy was installed but its Python runtime is unavailable"
        )
    for agent, root in skill_roots().items():
        destination = root / "graphify"
        if (destination / "SKILL.md").is_file():
            continue
        if destination.exists() or destination.is_symlink():
            raise RuntimeError(f"Refusing to overwrite incomplete skill: {destination}")
        platform = "agents" if agent == "codex" else "claude"
        subprocess.run(
            [
                str(tool_python),
                "-c",
                "import sys; from graphify.install import _copy_skill_file; _copy_skill_file(sys.argv[1])",
                platform,
            ],
            check=True,
        )


def restore(source_root: Path, python: Path, stefania_home: Path) -> int:
    required = (
        "agent-core/references/skills-catalog.md",
        "scripts/setup/install_skills.py",
        "scripts/setup/install_global_agent_core.py",
        "automations/stefania-memory/SKILL.md",
        "automations/stefania-bug-hook/SKILL.md",
        "skills/core/stefania-mcp-store/scripts/install_official_client.py",
    )
    absent = [name for name in required if not (source_root / name).is_file()]
    if absent:
        print(
            f"Stefania sources are unavailable or incomplete: {source_root}",
            file=sys.stderr,
        )
        print(
            "Mount Arcadia or supply --source-root with a complete Stefania checkout.",
            file=sys.stderr,
        )
        return 1
    if not runtime_works(python):
        print(
            f"Prepare the Stefania Python 3.12+ environment first: {python}",
            file=sys.stderr,
        )
        print(
            "Required packages: tomlkit, json5, websockets, requests, PyYAML.",
            file=sys.stderr,
        )
        return 1
    if Path(sys.executable).absolute() != python:
        os.execv(
            str(python), [str(python), str(Path(__file__).resolve()), *sys.argv[1:]]
        )
    os.environ.update(
        STEFANIA_PROJECT_DIR=str(source_root),
        STEFANIA_HOME=str(stefania_home),
        STEFANIA_PYTHON=str(python),
        STEFANIA_INSTALL_MODE="default",
    )
    sys.path.insert(0, str(source_root))
    from scripts.common.config_io import ConfigStore
    from scripts.setup import install_global_agent_core, install_skills

    ConfigStore(stefania_home=stefania_home).set_customize(
        {"STEFANIA_PYTHON": str(python)}
    )
    counts = install_global_agent_core.install_to_stefania_home(dry_run=False)
    print(f"Stefania shared runtime: {counts}")
    success, reason = install_skills.install_kb_common_contract(source_root)
    if not success:
        raise RuntimeError(reason)
    selected = sorted(set(selected_skills()) - {"graphify", *AUTOMATIONS})
    for agent, root in skill_roots().items():
        subprocess.run(
            [
                str(python),
                str(source_root / "scripts/setup/install_skills.py"),
                "--agent",
                agent,
                "--selected-skills",
                ",".join(selected),
                "--only-missing",
                "--allow-missing-prereqs",
                "--lenient-env",
                str(source_root),
            ],
            check=True,
        )
        install_skills._ONLY_MISSING = True
        install_skills._ALLOW_MISSING_PREREQS = True
        install_skills._LENIENT_ENV = True
        for name in AUTOMATIONS:
            destination = root / name
            if (destination / "SKILL.md").is_file():
                continue
            if destination.exists() or destination.is_symlink():
                raise RuntimeError(
                    f"Refusing to overwrite incomplete skill: {destination}"
                )
            success, reason = install_skills.install_skill_safely(
                source_root / "automations" / name, root, agent
            )
            if not success:
                raise RuntimeError(f"Cannot install {name}: {reason}")
    if any(not (stefania_home / "mcp" / name).is_file() for name in MCP_FILES):
        subprocess.run(
            [
                str(python),
                str(
                    source_root
                    / "skills/core/stefania-mcp-store/scripts/install_official_client.py"
                ),
                "--mcp-dir",
                str(stefania_home / "mcp"),
            ],
            check=True,
        )
    install_graphify(python)
    restore_dependencies(python, install_skills)
    return check_installation(python, stefania_home)


def main() -> int:
    args = arguments()
    python = args.python.expanduser().absolute()
    stefania_home = (
        Path(os.environ.get("STEFANIA_HOME", str(Path.home() / ".stefania")))
        .expanduser()
        .absolute()
    )
    try:
        if args.check:
            return check_installation(python, stefania_home)
        return restore(args.source_root.expanduser().absolute(), python, stefania_home)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Stefania restore failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
