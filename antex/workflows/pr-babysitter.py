import hashlib
import json
import re
import sys
import time


WORKFLOW = {
    "id": "pr-babysitter",
    "title": "PR babysitter",
    "description": "Keep a pull request moving until CI is green and every review thread is resolved.",
    "version": 1,
    "fields": [
        {
            "id": "pull_request",
            "label": "Pull request",
            "description": "PR URL, number, or auto to infer it from the current branch.",
            "type": "text",
            "required": True,
            "default": "auto",
            "placeholder": "https://github.com/owner/repo/pull/123",
        },
        {
            "id": "poll_interval_seconds",
            "label": "Poll interval",
            "description": "Seconds between unchanged GitHub snapshots.",
            "type": "integer",
            "min": 30,
            "max": 900,
            "default": 60,
        },
        {
            "id": "monitor_model",
            "label": "Monitor model",
            "description": "Cheap model used only for read-only GitHub snapshots.",
            "type": "text",
            "default": "gpt-5.6-luna",
            "placeholder": "gpt-5.6-luna",
        },
        {
            "id": "monitor_reasoning",
            "label": "Monitor reasoning",
            "type": "select",
            "options": [
                {"value": "low", "label": "Low"},
                {"value": "medium", "label": "Medium"},
            ],
            "default": "low",
        },
        {
            "id": "worker_model",
            "label": "Worker model",
            "description": "Strong model started with a clean context for each repair wave.",
            "type": "text",
            "default": "gpt-5.6-sol",
            "placeholder": "gpt-5.6-sol",
        },
        {
            "id": "worker_reasoning",
            "label": "Worker reasoning",
            "type": "select",
            "options": [
                {"value": "medium", "label": "Medium"},
                {"value": "high", "label": "High"},
                {"value": "xhigh", "label": "Extra high"},
            ],
            "default": "high",
        },
        {
            "id": "stable_green_polls",
            "label": "Stable green snapshots",
            "description": "Consecutive clean snapshots required before completion.",
            "type": "integer",
            "min": 1,
            "max": 10,
            "default": 2,
        },
        {
            "id": "max_worker_failures",
            "label": "Worker retry limit",
            "description": "Repeated failures on an unchanged issue set before requesting help.",
            "type": "integer",
            "min": 1,
            "max": 10,
            "default": 3,
        },
    ],
    "guardrails": {
        "max_agent_calls": 50000,
        "max_shell_calls": 10000,
        "max_parallel_agents": 1,
        "timeout_seconds": 2592000,
    },
}


MONITOR_POLICY = """You are the read-only monitor in a persistent pull request workflow.
Use GitHub MCP tools for every GitHub read. Never mutate GitHub, never edit files, never run git
push, never post comments, never resolve threads, and never rerun checks. Keep reasoning and output
minimal. Return only the requested JSON object."""


WORKER_POLICY = """You are the repair worker in a persistent pull request workflow. These rules
are mandatory and outrank the task prompt:

1. NEVER send, post, suggest, quote for execution, or invoke any Quality Graph ignore command.
Forbidden forms include `/qg ... ignore`, `/QG ... ignore`, commands that ignore a file, finding,
rule, check, or path, and semantically equivalent Quality Graph suppression commands.
2. Never add noqa, lint suppressions, exclusions, skipped checks, disabled tests, weakened quality
gates, blanket allow rules, generated baselines, or configuration changes whose purpose is hiding a
reported problem.
3. Fix the root cause honestly. If the finding is genuinely expected and the only correct outcome
requires a human-approved exclusion or Quality Graph decision, make no suppression and return
status `needs_user` with a precise explanation. A red check is allowed in that terminal state.
4. Never force push, never push to the default branch, never bypass branch protection, and never
rewrite published history.
5. Use GitHub MCP tools, not gh CLI, for GitHub reads, review replies, thread resolution, and CI
operations. Local git commands are allowed only in the current PR checkout.
6. A reviewer thread is handled only after its requested code change is pushed, or after a truthful
reply explains why it is not applicable. Prefix automated replies with `[from Codex workflow]:`.
7. Work only on the exact issue bundle supplied in the task. Return only the requested JSON object.
"""


PREPARE_CHECKOUT_SCRIPT = r"""
import json
import pathlib
import subprocess
import sys


def git(*args, cwd=None, capture=True):
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip() if capture else ""


request = json.loads(sys.argv[1])
root = pathlib.Path(git("rev-parse", "--show-toplevel")).resolve()
number = int(request["number"])
expected_head = request["head_sha"]
local_ref = f"refs/codex/pr-{number}"
git("fetch", "--no-tags", "origin", f"+refs/pull/{number}/head:{local_ref}")
fetched_head = git("rev-parse", local_ref)
if fetched_head != expected_head:
    raise RuntimeError(
        f"fetched PR head {fetched_head} does not match monitor head {expected_head}"
    )

worktree = root / ".git" / "codex-workflow-checkouts" / f"pr-{number}"
if worktree.exists():
    if not (worktree / ".git").exists():
        raise RuntimeError(f"existing checkout is not a git worktree: {worktree}")
    current_head = git("rev-parse", "HEAD", cwd=worktree)
    if current_head != fetched_head:
        if git("status", "--porcelain", cwd=worktree):
            raise RuntimeError(
                f"existing PR checkout is dirty and behind the PR head: {worktree}"
            )
        subprocess.run(
            ["git", "merge-base", "--is-ancestor", current_head, fetched_head],
            cwd=worktree,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        git("merge", "--ff-only", fetched_head, cwd=worktree, capture=False)
else:
    worktree.parent.mkdir(parents=True, exist_ok=True)
    git("worktree", "add", "--detach", str(worktree), fetched_head, capture=False)

dirty = bool(git("status", "--porcelain", cwd=worktree))
print(json.dumps({"path": str(worktree), "head_sha": fetched_head, "dirty": dirty}))
"""


def parse_json(message):
    text = message.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1]).strip()
        if text.startswith("json"):
            text = text[4:].lstrip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end < start:
            raise RuntimeError("agent did not return a JSON object")
        value = json.loads(text[start : end + 1])
    if not isinstance(value, dict):
        raise TypeError("agent returned a non-object result")
    return value


def monitor_prompt(target, prior_head_sha):
    return f"""Inspect pull request `{target}` using GitHub MCP tools. If target is `auto`, infer the
repository and pull request from the current checkout and branch before querying GitHub.

The previously observed head SHA is `{prior_head_sha or 'unknown'}`.

Read the PR state, head SHA, mergeability, review decision, every current check, all published review
submissions, issue comments, inline comments, and unresolved review threads. Ignore pending draft
reviews and unrelated bot noise. Include trusted human feedback and code-review bot feedback.

Return JSON only in this exact shape:
{{
  "repository":"owner/repo",
  "number":123,
  "url":"https://github.com/owner/repo/pull/123",
  "state":"open|merged|closed",
  "head_sha":"full sha",
  "head_ref":"PR head branch name",
  "mergeable":true,
  "review_decision":"approved|changes_requested|review_required|none",
  "ci_status":"green|pending|failing",
  "checks":{{"passed":0,"pending":0,"failed":0,"total":0}},
  "failed_checks":[
    {{"id":"stable check or run id","name":"check name","url":"url","summary":"short failure"}}
  ],
  "unresolved_feedback":[
    {{"id":"stable comment or thread id","kind":"inline|issue|review","author":"login","path":"path or empty","line":0,"url":"url","body":"bounded exact feedback"}}
  ]
}}

Use stable GitHub IDs. Limit each body and summary to 1200 characters and return at most 100 failed
checks and 100 unresolved feedback items. `ci_status` is green only when every required/current
check is successful or legitimately skipped by GitHub itself. A comment is unresolved until its
thread is resolved or its request has a published, adequate answer and no pending follow-up.
"""


def worker_prompt(snapshot, checkout):
    issue_bundle = {
        "repository": snapshot["repository"],
        "number": snapshot["number"],
        "url": snapshot["url"],
        "head_sha": snapshot["head_sha"],
        "head_ref": snapshot["head_ref"],
        "failed_checks": snapshot["failed_checks"],
        "unresolved_feedback": snapshot["unresolved_feedback"],
    }
    return f"""Bring this exact pull request issue bundle closer to a clean state:

{json.dumps(issue_bundle, ensure_ascii=False, sort_keys=True)}

The workflow prepared a real git worktree at `{checkout['path']}` with HEAD
`{checkout['head_sha']}`. Existing workflow-owned uncommitted changes: `{checkout['dirty']}`. If
true, inspect and continue those changes instead of discarding them. Work only in that checkout.
Do not create another worktree, clone, copy,
`.repair-*` directory, patch directory, or detached project copy. Start by running `git status` and
confirming HEAD. Process review feedback before CI failures when a
code change will retrigger CI. For every feedback item, either implement the valid request and push
an ordinary commit, or publish a truthful reply explaining why it is not applicable and resolve the
thread when permitted. Diagnose failed checks from their actual logs. Retry a check only for a
genuine transient infrastructure failure; never change code to accommodate unrelated infrastructure.

If a correct fix requires any suppression, exclusion, ignored rule, ignored path, noqa, disabled
test, weakened quality gate, or Quality Graph decision, do not apply it. Return `needs_user` and
leave the check red for human validation.

After every code change, run proportionate local validation and commit normally. Push the final
commit with exactly `git push origin HEAD:refs/heads/{snapshot['head_ref']}`. Never force push.
Re-read GitHub after mutations and confirm the PR head changed. Return JSON only:
{{
  "status":"changed|resolved|waiting|needs_user|failed",
  "summary":"short factual result",
  "commit":"sha or empty",
  "handled_ids":["ids actually fixed, answered, or resolved"],
  "needs_user_reason":"precise blocker or empty"
}}
"""


def normalize_snapshot(raw):
    state = str(raw.get("state", "")).strip().lower()
    if state not in {"open", "merged", "closed"}:
        raise RuntimeError("monitor returned an invalid PR state")
    ci_status = str(raw.get("ci_status", "")).strip().lower()
    if ci_status not in {"green", "pending", "failing"}:
        raise RuntimeError("monitor returned an invalid CI status")
    repository = str(raw.get("repository", "")).strip()
    url = str(raw.get("url", "")).strip()
    head_sha = str(raw.get("head_sha", "")).strip()
    head_ref = str(raw.get("head_ref", "")).strip()
    number = int(raw.get("number", 0))
    if not repository or not url or not head_sha or not head_ref or number <= 0:
        raise RuntimeError("monitor omitted required pull request identity")
    failed_checks = normalize_items(raw.get("failed_checks"), "failed check")
    unresolved_feedback = normalize_items(raw.get("unresolved_feedback"), "feedback")
    checks = raw.get("checks") if isinstance(raw.get("checks"), dict) else {}
    return {
        "repository": repository,
        "number": number,
        "url": url,
        "state": state,
        "head_sha": head_sha,
        "head_ref": head_ref,
        "mergeable": raw.get("mergeable") is True,
        "review_decision": str(raw.get("review_decision", "none")),
        "ci_status": ci_status,
        "checks": {
            "passed": int(checks.get("passed", 0)),
            "pending": int(checks.get("pending", 0)),
            "failed": int(checks.get("failed", 0)),
            "total": int(checks.get("total", 0)),
        },
        "failed_checks": failed_checks,
        "unresolved_feedback": unresolved_feedback,
    }


def normalize_items(value, label):
    if not isinstance(value, list):
        raise RuntimeError(f"monitor returned invalid {label} items")
    if len(value) > 100:
        raise RuntimeError(f"monitor returned more than 100 {label} items")
    normalized = []
    seen = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id", "")).strip()
        if not item_id or item_id in seen:
            continue
        seen.add(item_id)
        normalized.append(
            {
                key: str(item.get(key, ""))[:1200]
                for key in ("id", "name", "kind", "author", "path", "line", "url", "body", "summary")
                if key in item
            }
        )
    return normalized


def issue_signature(snapshot):
    value = {
        "head_sha": snapshot["head_sha"],
        "ci_status": snapshot["ci_status"],
        "failed": [item["id"] for item in snapshot["failed_checks"]],
        "feedback": [item["id"] for item in snapshot["unresolved_feedback"]],
    }
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def is_ready(snapshot):
    return (
        snapshot["state"] == "open"
        and snapshot["ci_status"] == "green"
        and snapshot["mergeable"]
        and not snapshot["failed_checks"]
        and not snapshot["unresolved_feedback"]
        and snapshot["review_decision"].lower()
        not in {"changes_requested", "review_required"}
    )


def forbidden_quality_graph_text(value):
    text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    return re.search(r"/\s*qg\b[^\n]*\bignore\b", text, flags=re.IGNORECASE) is not None


def prepare_checkout(ctx, snapshot):
    ctx.progress(f"Preparing git checkout for PR #{snapshot['number']}")
    result = ctx.shell(
        [
            sys.executable,
            "-c",
            PREPARE_CHECKOUT_SCRIPT,
            json.dumps(
                {"number": snapshot["number"], "head_sha": snapshot["head_sha"]},
                sort_keys=True,
            ),
        ],
        timeout_seconds=300,
    )
    if result.get("exit_code") != 0:
        error = result.get("stderr") or result.get("stdout") or "checkout preparation failed"
        raise RuntimeError(str(error)[-2000:])
    try:
        checkout = json.loads(result.get("stdout", ""))
    except json.JSONDecodeError as error:
        raise RuntimeError("checkout preparation returned invalid JSON") from error
    if not isinstance(checkout, dict) or not checkout.get("path"):
        raise RuntimeError("checkout preparation omitted its path")
    return checkout


def terminal_result(status, snapshot, state, reason=""):
    return {
        "status": status,
        "pull_request": snapshot.get("url") if snapshot else state.get("target"),
        "head_sha": snapshot.get("head_sha", "") if snapshot else "",
        "checks": snapshot.get("checks", {}) if snapshot else {},
        "polls": state.get("polls", 0),
        "worker_calls": state.get("worker_calls", 0),
        "reason": reason,
    }


def run(ctx):
    target = ctx.params["pull_request"].strip()
    poll_interval = ctx.params["poll_interval_seconds"]
    monitor_model = ctx.params["monitor_model"].strip() or None
    monitor_reasoning = ctx.params["monitor_reasoning"]
    worker_model = ctx.params["worker_model"].strip() or None
    worker_reasoning = ctx.params["worker_reasoning"]
    stable_required = ctx.params["stable_green_polls"]
    max_worker_failures = ctx.params["max_worker_failures"]
    state = ctx.state or {
        "target": target,
        "polls": 0,
        "worker_calls": 0,
        "stable_green_polls": 0,
        "last_signature": "",
        "same_issue_failures": 0,
    }
    if state.get("target") != target:
        raise RuntimeError("resumed workflow target does not match its original pull request")

    while True:
        poll_number = int(state.get("polls", 0)) + 1
        ctx.progress(f"Polling PR state · snapshot {poll_number}")
        monitor = ctx.agent(
            monitor_prompt(target, state.get("head_sha", "")),
            model=monitor_model,
            reasoning_effort=monitor_reasoning,
            developer_instructions=MONITOR_POLICY,
            sandbox="read-only",
            timeout_seconds=600,
        )
        if not monitor.get("success"):
            failures = int(state.get("monitor_failures", 0)) + 1
            state["monitor_failures"] = failures
            state["polls"] = poll_number
            ctx.checkpoint(state)
            if failures >= max_worker_failures:
                return terminal_result(
                    "needs_user",
                    None,
                    state,
                    monitor.get("error") or "monitor repeatedly failed",
                )
            time.sleep(poll_interval)
            continue

        try:
            snapshot = normalize_snapshot(parse_json(monitor.get("message", "")))
        except (RuntimeError, TypeError, ValueError, json.JSONDecodeError) as error:
            failures = int(state.get("monitor_failures", 0)) + 1
            state["monitor_failures"] = failures
            state["polls"] = poll_number
            state["last_monitor_error"] = str(error)[-2000:]
            ctx.checkpoint(state)
            if failures >= max_worker_failures:
                return terminal_result("needs_user", None, state, str(error))
            time.sleep(poll_interval)
            continue

        state.update(
            {
                "polls": poll_number,
                "monitor_failures": 0,
                "head_sha": snapshot["head_sha"],
                "last_snapshot": {
                    "url": snapshot["url"],
                    "head_sha": snapshot["head_sha"],
                    "ci_status": snapshot["ci_status"],
                    "checks": snapshot["checks"],
                    "unresolved_feedback": len(snapshot["unresolved_feedback"]),
                },
            }
        )

        pending_push = state.get("pending_push_verification")
        if isinstance(pending_push, dict):
            previous_head = str(pending_push.get("previous_head_sha", ""))
            expected_commit = str(pending_push.get("commit", ""))
            if snapshot["head_sha"] == previous_head:
                state.pop("pending_push_verification", None)
                state["same_issue_failures"] = int(
                    state.get("same_issue_failures", 0)
                ) + 1
                state["last_worker_error"] = (
                    "worker reported a change but the PR head SHA did not move"
                )
                ctx.checkpoint(state)
                if state["same_issue_failures"] >= max_worker_failures:
                    return terminal_result(
                        "needs_user",
                        snapshot,
                        state,
                        state["last_worker_error"],
                    )
                time.sleep(poll_interval)
                continue
            if not snapshot["head_sha"].startswith(expected_commit):
                state.pop("pending_push_verification", None)
                ctx.checkpoint(state)
                return terminal_result(
                    "needs_user",
                    snapshot,
                    state,
                    "PR head changed to an unexpected commit while verifying the worker push",
                )
            state.pop("pending_push_verification", None)
            state["same_issue_failures"] = 0
            state["last_signature"] = ""

        if snapshot["state"] in {"merged", "closed"}:
            ctx.checkpoint(state)
            return terminal_result(snapshot["state"], snapshot, state)

        if is_ready(snapshot):
            state["stable_green_polls"] = int(state.get("stable_green_polls", 0)) + 1
            state["last_signature"] = ""
            state["same_issue_failures"] = 0
            ctx.checkpoint(state)
            if state["stable_green_polls"] >= stable_required:
                ctx.progress("Pull request is green, mergeable, and review-clean")
                return terminal_result("ready", snapshot, state)
            time.sleep(poll_interval)
            continue

        state["stable_green_polls"] = 0
        signature = issue_signature(snapshot)
        has_actionable_bundle = bool(
            snapshot["failed_checks"] or snapshot["unresolved_feedback"]
        )
        if not has_actionable_bundle:
            state["last_signature"] = ""
            state["same_issue_failures"] = 0
            ctx.checkpoint(state)
            ctx.progress(
                f"Waiting · CI {snapshot['ci_status']} · mergeable {snapshot['mergeable']}"
            )
            time.sleep(poll_interval)
            continue

        same_signature = signature == state.get("last_signature")
        if same_signature:
            same_issue_failures = int(state.get("same_issue_failures", 0))
            if same_issue_failures >= max_worker_failures:
                ctx.checkpoint(state)
                return terminal_result(
                    "needs_user",
                    snapshot,
                    state,
                    "the same PR issue bundle remained after the worker retry budget",
                )
            if same_issue_failures > 0:
                time.sleep(poll_interval)
        else:
            state["same_issue_failures"] = 0

        try:
            checkout = prepare_checkout(ctx, snapshot)
        except RuntimeError as error:
            state["last_checkout_error"] = str(error)[-2000:]
            ctx.checkpoint(state)
            return terminal_result("needs_user", snapshot, state, str(error))
        ctx.progress(
            f"Repairing {len(snapshot['unresolved_feedback'])} review items and "
            f"{len(snapshot['failed_checks'])} failed checks"
        )
        worker = ctx.agent(
            worker_prompt(snapshot, checkout),
            model=worker_model,
            reasoning_effort=worker_reasoning,
            developer_instructions=WORKER_POLICY,
            forbid_quality_graph_ignore=True,
            sandbox="danger-full-access",
            cwd=checkout["path"],
            timeout_seconds=1800,
        )
        state["worker_calls"] = int(state.get("worker_calls", 0)) + 1
        state["last_signature"] = signature

        if not worker.get("success"):
            state["same_issue_failures"] = int(state.get("same_issue_failures", 0)) + 1
            state["last_worker_error"] = (worker.get("error") or "worker failed")[-2000:]
            ctx.checkpoint(state)
            continue

        try:
            worker_result = parse_json(worker.get("message", ""))
        except (RuntimeError, TypeError, json.JSONDecodeError) as error:
            state["same_issue_failures"] = int(state.get("same_issue_failures", 0)) + 1
            state["last_worker_error"] = str(error)[-2000:]
            ctx.checkpoint(state)
            continue

        if forbidden_quality_graph_text(worker_result):
            state["same_issue_failures"] = max_worker_failures
            ctx.checkpoint(state)
            return terminal_result(
                "needs_user",
                snapshot,
                state,
                "worker output contained a forbidden Quality Graph ignore command",
            )

        worker_status = str(worker_result.get("status", "failed")).strip().lower()
        worker_commit = str(worker_result.get("commit", "")).strip().lower()
        state["last_worker_result"] = {
            "status": worker_status,
            "summary": str(worker_result.get("summary", ""))[-2000:],
            "commit": worker_commit,
        }
        if worker_status == "needs_user":
            ctx.checkpoint(state)
            return terminal_result(
                "needs_user",
                snapshot,
                state,
                str(worker_result.get("needs_user_reason", "manual validation required")),
            )
        if worker_status == "changed":
            if re.fullmatch(r"[0-9a-f]{7,40}", worker_commit) is None:
                state["same_issue_failures"] = int(
                    state.get("same_issue_failures", 0)
                ) + 1
                state["last_worker_error"] = (
                    "worker reported changed without a valid commit SHA"
                )
                ctx.checkpoint(state)
                continue
            state["pending_push_verification"] = {
                "previous_head_sha": snapshot["head_sha"],
                "commit": worker_commit,
            }
            ctx.checkpoint(state)
            ctx.progress(f"Verifying pushed commit {worker_commit[:12]}")
            continue
        state["same_issue_failures"] = int(state.get("same_issue_failures", 0)) + 1
        ctx.checkpoint(state)
