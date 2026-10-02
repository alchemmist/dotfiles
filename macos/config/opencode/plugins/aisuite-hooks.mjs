/**
 * aisuite-hooks.mjs — OpenCode plugin that bridges hook events to the aisuite CLI.
 *
 * The plugin reads its hook definitions from options.hooks (an array of objects with
 * hook_type and argv). On each OpenCode hook event, it finds matching definitions,
 * spawns the aisuite subprocess (argv[0] executable, argv[1:] args) with JSON on
 * stdin, and processes the JSON stdout response.
 *
 * argv is a list of strings produced by the Python side (shlex.split of the
 * shell-joined hook command). The plugin passes it to spawn() directly — no
 * shell, no whitespace split — so --params JSON with spaces stays one argument.
 * Legacy entries that only have a shell-joined ``command`` string still work via
 * ``shell: true`` until opencode.json is regenerated.
 *
 * OpenCode hook contract:
 *   - `tool.execute.before(input, output) => Promise<void>` — mutate output.args or throw to deny.
 *   - `tool.execute.after(input, output) => Promise<void>` — telemetry only.
 *   - `event(input) => Promise<void>` — bridge to session lifecycle and permission_request notifications.
 *     Stop follow-up is injected via `client.session.prompt`, not returned to OpenCode.
 *     Permission hook output is ignored because generic event callbacks are observational.
 *
 * Session lifecycle is approximated via the generic `event` hook:
 *   session_start ≈ event.type === "session.created"
 *   stop          ≈ event.type === "session.status" with idle status
 *                   (or legacy event.type === "session.idle")
 *   permission_request = event.type === "permission.asked" or "permission.v2.asked"
 *   prompt_submit — NOT SUPPORTED via current OpenCode hooks (message.updated is too lossy).
 *
 * Multiple hooks of the same type run sequentially; first deny short-circuits pre-hooks.
 *
 * Preset `env` field: options.env (a plain {NAME: value} map) is injected into every shell
 * command's environment via the `shell.env` hook. Unlike the hook types above, this is not
 * driven by options.hooks entries — it fires unconditionally whenever options.env is
 * non-empty, independent of which (if any) hook types were requested.
 * PATH is prepended onto output.env.PATH without rewriting it (empty
 * components and duplicates stay). Fallback to process.env.PATH only when
 * the key is missing. Other keys overwrite. Host PATH is never snapshotted
 * into options.env.
 */

import { spawn } from "node:child_process";
import { delimiter as pathDelimiter } from "node:path";

const SESSION_UPDATE_NOTICE_ENV = "AISUITE_SESSION_UPDATE_NOTICE_ID";
const SESSION_UPDATE_NOTICE_RE = /^[0-9a-f]{32}$/;
const STOP_EXECUTION_MODE_UPDATE_NOTICE = "aisuite_update_notice";

let sessionJournalModule;

function sessionJournal() {
  sessionJournalModule ||= import("./opencode-session-journal.mjs");
  return sessionJournalModule;
}

function forgetSessionJournal(sessionID) {
  if (!sessionJournalModule) return;
  void sessionJournalModule
    .then((journal) => journal.forgetOpenCodeSession(sessionID))
    .catch((err) => console.error(`[aisuite-hooks] OpenCode journal cleanup failed (ignored): ${err.message}`));
}

function reportIgnoredUpdateNoticeError(message) {
  // console.error is rendered directly next to OpenCode's prompt.  Stop is a
  // fail-open notification path, so keep expected failures quiet by default
  // while retaining an explicit local diagnostic switch.
  if (process.env.AISUITE_OPENCODE_DEBUG === "1") {
    console.error(`[aisuite-hooks] ${message}`);
  }
}

function prependPath(managedPath, livePath) {
  if (livePath === undefined) {
    return managedPath;
  }
  const prefix = managedPath + pathDelimiter;
  if (livePath === managedPath || livePath.startsWith(prefix)) {
    return livePath;
  }
  return prefix + livePath;
}

// Tool name mapping: OpenCode tool IDs (lowercase) → aisuite hook suffixes.
const TOOL_SUFFIX_MAP = {
  bash: "shell",
  grep: "grep",
  glob: "grep",
  read: "read",
  edit: "write",
  write: "write",
};

// Hook types unsupported at the plugin runtime layer.  Entries with these
// types are filtered out on server start and a one-time warning is printed.
// Must stay in sync with opencode/hook_manager.py _UNSUPPORTED_HOOK_TYPES.
const UNSUPPORTED_HOOK_TYPES = {
  prompt_submit:
    "reinstall aisuite hooks to remove this entry",
  post_tool_use_failure:
    "OpenCode has no post-tool-failure hook",
  session_end:
    "OpenCode has no awaited session-end lifecycle event; use Stop/session idle for durable flushing",
};

/**
 * Determine the set of hook-type suffixes that fire for a given OpenCode
 * tool.execute.before / tool.execute.after event, based on the tool ID.
 *
 * Returns suffixes appended to the hook prefix (e.g. "pre_tool_use" or "post_tool_use"):
 *   generic case  → [""]
 *   tool-specific → ["", "_<suffix>"]  (e.g. "" and "_grep" for toolId "grep")
 *
 * Callers concatenate: `"pre_tool_use" + s` → `"pre_tool_use"` or `"pre_tool_use_grep"`.
 */
function toolHookTypes(toolId) {
  const suffix = TOOL_SUFFIX_MAP[toolId];
  const suffixes = [""]; // generic: prefix + "" → "pre_tool_use"
  if (suffix) {
    suffixes.push(`_${suffix}`); // specific: prefix + "_grep" → "pre_tool_use_grep"
  }
  return suffixes;
}

/** Match an optional exact tool matcher without depending on agent spelling. */
function matchesTool(matcher, toolId) {
  if (typeof matcher !== "string" || !matcher.trim()) return true;
  const normalize = (value) => value.toLowerCase().replace(/[_-]/g, "");
  return normalize(matcher.trim()) === normalize(toolId);
}

/**
 * Validate the argv field on a hook definition.
 * Returns an error string if malformed, or null if ok.
 */
function validateArgv(argv) {
  if (!Array.isArray(argv)) {
    return `argv must be an array of strings, got ${typeof argv}`;
  }
  if (argv.length === 0) {
    return "argv must not be empty";
  }
  for (let i = 0; i < argv.length; i++) {
    if (typeof argv[i] !== "string") {
      return `argv[${i}] must be a string, got ${typeof argv[i]}`;
    }
  }
  return null;
}

function declaredHookTimeoutMs(hookDef) {
  if (Number.isInteger(hookDef.timeout) && hookDef.timeout > 0) {
    return hookDef.timeout * 1000;
  }

  // Configurations generated before ``timeout`` became the common schema used
  // milliseconds in this private field. Keep them working during migration.
  const legacyTimeout = Number(hookDef.timeout_ms);
  return Number.isFinite(legacyTimeout) && legacyTimeout > 0 ? legacyTimeout : null;
}

function hookTimeoutMs(hookDef) {
  const configuredTimeout = declaredHookTimeoutMs(hookDef);
  const environmentTimeout = Number(process.env.AISUITE_OPENCODE_HOOK_TIMEOUT_MS || 30000);
  if (configuredTimeout !== null) {
    return configuredTimeout;
  }
  return Number.isFinite(environmentTimeout) && environmentTimeout > 0 ? environmentTimeout : 30000;
}

function isUpdateNoticeStop(hookDef) {
  return (
    hookDef.hook_type === "stop" &&
    hookDef.execution_mode === STOP_EXECUTION_MODE_UPDATE_NOTICE
  );
}

async function runWithTimeout(action, timeoutMs, label) {
  let timer;
  const controller = new AbortController();
  const actionPromise = Promise.resolve().then(() => action(controller.signal));
  try {
    return await Promise.race([
      actionPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error(`${label} timed out after ${timeoutMs}ms`);
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    void actionPromise.catch(() => {});
  }
}

async function materializeTranscript(client, sessionID, sessionInfo, signal, transcriptChanges) {
  const journal = await sessionJournal();
  return journal.captureOpenCodeSession(client, sessionID, sessionInfo, false, signal, transcriptChanges);
}

function hookMaterializationTimeoutMs(hookDef) {
  const configuredTimeout = Number(hookDef.materialization_timeout_ms);
  const totalTimeout = hookTimeoutMs(hookDef);
  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return Math.min(configuredTimeout, totalTimeout);
  }
  return 0;
}

async function readSessionInfo(client, sessionID, signal) {
  const get = client?.session?.get;
  if (typeof get !== "function") return null;
  const journal = await sessionJournal();
  const result = journal.unwrapSDKData(
    await journal.awaitSDKResponse(
      get.call(client.session, { path: { id: sessionID } }),
      signal,
    ),
  );
  return result && typeof result === "object" ? result : null;
}

/**
 * Resolve how to spawn a hook entry.
 *
 * Prefer ``argv`` (current opencode.json). Fall back to legacy ``command`` string
 * via ``shell: true`` so an old config still works until the user re-runs setup
 * (rule 2.3: new aisuite over stale IDE artifacts).
 *
 * Returns ``{ok: true, type: "argv", argv}`` | ``{ok: true, type: "command", command}``
 * | ``{ok: false, error}``.
 */
function resolveHookSpawn(hookDef) {
  if (!validateArgv(hookDef.argv)) {
    return { ok: true, type: "argv", argv: hookDef.argv };
  }
  if (typeof hookDef.command === "string" && hookDef.command.trim()) {
    return { ok: true, type: "command", command: hookDef.command };
  }
  return {
    ok: false,
    error:
      "hook entry needs 'argv' (or legacy 'command'). " +
      "Re-run 'ya tool aisuite' to regenerate opencode.json.",
  };
}

/**
 * Run a single hook via subprocess: pipe JSON input, capture JSON stdout.
 * Returns parsed JSON object or null on empty/no-output.
 *
 * ``spawnSpec`` is either ``{type: "argv", argv}`` (spawn without shell) or
 * ``{type: "command", command}`` (legacy shell string — ``shell: true`` so
 * shlex quoting is honoured).
 *
 * Timeout: defaults to 30000 ms, overridable via AISUITE_OPENCODE_HOOK_TIMEOUT_MS.
 * A hook definition may declare its own positive integer ``timeout`` in seconds;
 * the plugin enforces that deadline around CLI cold-start and handler execution.
 * ``execution_mode`` is independent policy metadata.  The
 * ``aisuite_update_notice`` mode adds lifecycle barriers, session filtering,
 * update-token propagation, deduplication and quiet fail-open handling.  Hooks
 * without that mode only receive the ordinary per-entry timeout.
 * If this outer timeout expires the child is killed and the promise rejects.
 */
async function runHookCommand(
  spawnSpec,
  inputPayload,
  timeoutLimitMs = null,
  envOverrides = null,
) {
  const configuredTimeoutMs = Number(
    process.env.AISUITE_OPENCODE_HOOK_TIMEOUT_MS || 30000,
  );
  const safeConfiguredTimeoutMs =
    Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
      ? configuredTimeoutMs
      : 30000;
  const timeoutMs =
    timeoutLimitMs === null
      ? safeConfiguredTimeoutMs
      : Math.min(safeConfiguredTimeoutMs, timeoutLimitMs);
  const childEnv = envOverrides === null ? process.env : { ...process.env };
  if (envOverrides !== null) {
    for (const [name, value] of Object.entries(envOverrides)) {
      if (typeof value === "string" && value) {
        childEnv[name] = value;
      } else {
        delete childEnv[name];
      }
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    let child;
    if (spawnSpec.type === "argv") {
      const [executable, ...args] = spawnSpec.argv;
      child = spawn(executable, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: childEnv,
        detached: process.platform !== "win32",
      });
    } else {
      child = spawn(spawnSpec.command, [], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: childEnv,
        detached: process.platform !== "win32",
      });
    }

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killHookProcessTree(child);
      reject(new Error(`Hook command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        const err = new Error(`Hook command exited with code ${code}: ${stderr.trim()}`);
        err.exitCode = code;
        err.stderr = stderr;
        reject(err);
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(trimmed));
      } catch (e) {
        reject(new Error(`Invalid JSON output from hook: ${trimmed}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.stdin.on("error", (err) => {
      // A hook may exit before consuming stdin. Its close event reports the
      // actionable exit status; without a listener, EPIPE crashes OpenCode.
      if (err.code === "EPIPE" || settled) return;
      clearTimeout(timer);
      settled = true;
      killHookProcessTree(child);
      reject(err);
    });

    child.stdin.write(JSON.stringify(inputPayload));
    child.stdin.end();
  });
}

function killHookProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.on("error", () => child.kill("SIGKILL"));
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (err) {
    if (!err || err.code !== "ESRCH") {
      child.kill("SIGKILL");
    }
  }
}

/**
 * First non-empty stop nudge from hook JSON. Prefer followup_message (Cursor-like
 * wire field); fall back to deny_reason so Claude-style stop output still nudges.
 */
function followupText(result) {
  if (!result || typeof result !== "object") {
    return "";
  }
  if (typeof result.followup_message === "string") {
    const msg = result.followup_message.trim();
    if (msg) {
      return msg;
    }
  }
  if (typeof result.deny_reason === "string") {
    return result.deny_reason.trim();
  }
  return "";
}

/**
 * OpenCode event hooks cannot return a stop decision. Inject a new user turn
 * via the plugin SDK. Missing client or prompt failure is logged, never thrown.
 */
async function injectStopFollowup(client, sessionID, followup) {
  if (!followup || !sessionID) {
    return;
  }
  const prompt =
    client && client.session && typeof client.session.prompt === "function"
      ? client.session.prompt.bind(client.session)
      : null;
  if (!prompt) {
    console.error(
      "[aisuite-hooks] Stop follow-up skipped: OpenCode client.session.prompt is unavailable",
    );
    return;
  }
  try {
    await prompt({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: followup }] },
    });
  } catch (err) {
    console.error(
      `[aisuite-hooks] Stop follow-up prompt failed (ignored): ${err.message}`,
    );
  }
}

/**
 * Build the input payload for the aisuite command from the OpenCode tool.execute.before
 * hook input and output. Maps OpenCode tool IDs to aisuite argument keys.
 */
function buildToolInputPayload(toolId, input, output, cwd) {
  const args = output.args || {};
  return {
    tool_name: toolId,
    tool_use_id: input.callID || null,
    session_id: input.sessionID || null,
    cwd: cwd || null,
    tool_input: { ...args },
  };
}

/**
 * Build the normalized PermissionRequest payload from OpenCode's permission event.
 *
 * OpenCode v1 uses permission/patterns/always/tool while the newer v2 schema uses
 * action/resources/save/source. Supporting both shapes keeps the bridge compatible
 * while the event protocol migrates.
 */
function buildPermissionRequestPayload(event, props, cwd) {
  const permission = props.permission || props.action || null;
  const patterns = Array.isArray(props.patterns)
    ? props.patterns
    : Array.isArray(props.resources)
      ? props.resources
      : [];
  const suggestions = Array.isArray(props.always)
    ? props.always
    : Array.isArray(props.save)
      ? props.save
      : null;
  const tool = props.tool && typeof props.tool === "object"
    ? props.tool
    : props.source && typeof props.source === "object"
      ? props.source
      : {};
  const metadata = props.metadata && typeof props.metadata === "object"
    ? props.metadata
    : {};

  return {
    permission_id: props.id || null,
    session_id: props.sessionID || null,
    cwd: cwd || null,
    hook_event_name: event.type,
    tool_name: permission,
    tool_use_id: tool.callID || null,
    tool_input: {
      ...metadata,
      patterns: [...patterns],
    },
    permission_suggestions: suggestions ? [...suggestions] : null,
  };
}

/**
 * Merge modified fields from hook response back into output.args.
 * Keys returned as modified_command/pattern/path/glob/file_path are
 * mapped to the correct output.args keys based on the tool type.
 */
function applyModifiedArgs(toolId, currentArgs, result) {
  if (!result || typeof result !== "object") return;

  const suffix = TOOL_SUFFIX_MAP[toolId];
  // If the hook returns modified_tool_input, merge those keys directly
  if (result.modified_tool_input && typeof result.modified_tool_input === "object") {
    Object.assign(currentArgs, result.modified_tool_input);
  }

  // Map specific modified_* keys to args keys
  const mappings = {
    modified_command: "command",
    modified_pattern: "pattern",
    modified_path: "path",
    modified_glob: "glob",
    modified_file_path: "file_path",
  };

  for (const [respKey, argsKey] of Object.entries(mappings)) {
    if (result[respKey] !== undefined) {
      currentArgs[argsKey] = result[respKey];
    }
  }
}

export default {
  id: "aisuite-hooks",

  async server(input, options) {
    const rawHooks = options?.hooks || [];

    // Defensive runtime filter: drop unsupported hook types with one-time warning.
    const allHooks = rawHooks.filter((h) => {
      const reason = UNSUPPORTED_HOOK_TYPES[h.hook_type];
      if (reason) {
        console.error(
          `[aisuite-hooks] Unsupported OpenCode hook type '${h.hook_type}' skipped; ${reason}.`
        );
        return false;
      }
      return true;
    });

    const hooks = {};
    const sessionInfoByID = new Map();
    const lastStopBySession = new Map();
    const transcriptChangesBySession = new Map();
    const transcriptBaselinesBySession = new Set();
    let transcriptChangeVersion = 0;
    const clearSessionState = (sessionID) => {
      sessionInfoByID.delete(sessionID);
      lastStopBySession.delete(sessionID);
      transcriptChangesBySession.delete(sessionID);
      transcriptBaselinesBySession.delete(sessionID);
    };
    const recordTranscriptEvent = (sessionID, event) => {
      if (!sessionID || ![
        "message.updated",
        "message.removed",
        "message.part.updated",
        "message.part.delta",
        "message.part.removed",
      ].includes(event.type)) {
        return;
      }
      const props = event.properties || {};
      const messageID = event.type === "message.updated"
        ? props.info?.id
        : event.type === "message.part.updated"
          ? props.part?.messageID
          : props.messageID;
      if (typeof messageID !== "string" || !messageID) return;
      const changes = transcriptChangesBySession.get(sessionID) || new Map();
      changes.set(messageID, {
        message_id: messageID,
        deleted: event.type === "message.removed",
        version: ++transcriptChangeVersion,
      });
      transcriptChangesBySession.set(sessionID, changes);
    };
    const acknowledgeTranscriptChanges = (sessionID, capturedChanges) => {
      const current = transcriptChangesBySession.get(sessionID);
      if (!current) return;
      for (const change of capturedChanges) {
        if (current.get(change.message_id)?.version === change.version) {
          current.delete(change.message_id);
        }
      }
      if (current.size === 0) transcriptChangesBySession.delete(sessionID);
    };
    // Update-notice hooks are allowed only for known top-level sessions.
    // Session identity is learned from lifecycle events, never by querying the
    // SDK from the Stop critical path.
    const topLevelSessionIds = new Set();
    const subagentSessionIds = new Set();
    const boundedStopInFlightSessionIds = new Set();
    const sessionStartInFlightById = new Map();
    const sessionUpdateNoticeIds = new Map();

    // ── tool.execute.before ──────────────────────────────────────
    // Pre-tool hook: sequential, first deny short-circuits via throw,
    // modified args are merged into output.args.
    const preToolHooks = allHooks.filter((h) =>
      h.hook_type.startsWith("pre_tool_use")
    );
    if (preToolHooks.length > 0) {
      hooks["tool.execute.before"] = async (hookInput, hookOutput) => {
        const toolId = (hookInput.tool || "").toLowerCase();
        const suffixes = toolHookTypes(toolId).map((s) => s);

        // Find hooks matching this tool: specific first, then generic
        const matching = preToolHooks.filter((h) => {
          if (!matchesTool(h.matcher, toolId)) return false;
          if (h.hook_type === "pre_tool_use") return true;
          return suffixes.some((s) => h.hook_type === "pre_tool_use" + s);
        });

        let currentArgs = { ...(hookOutput.args || {}) };

        for (const hookDef of matching) {
          const spawnSpec = resolveHookSpawn(hookDef);
          if (!spawnSpec.ok) {
            throw new Error(
              `Denied by aisuite hook: ${hookDef.hook_type} ${spawnSpec.error}`
            );
          }

          const payload = buildToolInputPayload(toolId, hookInput, { args: currentArgs }, input.directory);
          let result;
          try {
            result = await runHookCommand(spawnSpec, payload, hookTimeoutMs(hookDef));
          } catch (err) {
            console.error(`[aisuite-hooks] Hook '${hookDef.hook_type}' error: ${err.message}`);
            throw new Error(`Denied by aisuite hook: ${err.message}`);
          }

          if (result === null) continue;

          if (result.permission === "deny") {
            throw new Error(result.deny_reason || "Denied by aisuite hook");
          }

          applyModifiedArgs(toolId, currentArgs, result);
        }

        // Preserve the args object supplied by OpenCode: the runtime keeps using
        // that object after this hook returns, so replacing it may be ignored.
        Object.assign(hookOutput.args, currentArgs);
      };
    }

    // ── tool.execute.after ──────────────────────────────────────
    // Post-tool hook: best-effort telemetry, ignore failures.
    const postToolHooks = allHooks.filter((h) =>
      h.hook_type.startsWith("post_tool_use")
    );
    if (postToolHooks.length > 0) {
      hooks["tool.execute.after"] = async (hookInput, hookOutput) => {
        const toolId = (hookInput.tool || "").toLowerCase();
        const suffixes = toolHookTypes(toolId).map((s) => s);

        const matching = postToolHooks.filter((h) => {
          if (!matchesTool(h.matcher, toolId)) return false;
          if (h.hook_type === "post_tool_use") return true;
          return suffixes.some((s) => h.hook_type === "post_tool_use" + s);
        });

        for (const hookDef of matching) {
          const spawnSpec = resolveHookSpawn(hookDef);
          if (!spawnSpec.ok) {
            console.error(
              `[aisuite-hooks] Post-hook '${hookDef.hook_type}' ${spawnSpec.error} (ignored)`
            );
            continue;
          }

          const payload = {
            ...buildToolInputPayload(toolId, hookInput, { args: hookInput.args }, input.directory),
            // Built-in tools hand the hook their ExecuteResult, MCP tools the raw MCP response —
            // only the former has a string `output` (opencode: packages/opencode/src/session/tools.ts).
            tool_output: typeof hookOutput.output === "string" ? hookOutput.output : null,
          };
          try {
            await runHookCommand(spawnSpec, payload, hookTimeoutMs(hookDef));
          } catch (err) {
            console.error(`[aisuite-hooks] Post-hook '${hookDef.hook_type}' error (ignored): ${err.message}`);
          }
        }
      };
    }

    // ── event ──────────────────────────────────────────────────
    // Bridge OpenCode events to session lifecycle and permission_request hooks.
    const eventHooks = allHooks.filter((h) =>
      ["session_start", "stop", "permission_request"].includes(h.hook_type)
    );
    if (eventHooks.length > 0) {
      hooks["event"] = async (eventInput) => {
        const event = eventInput.event;
        if (!event || !event.type) return;

        const props = event.properties || {};
        const eventInfo = props.info && typeof props.info === "object" ? props.info : null;
        const sessionID = props.sessionID
          || (eventInfo && (eventInfo.sessionID || eventInfo.id))
          || (props.part && props.part.sessionID)
          || null;
        if (sessionID && eventInfo && event.type.startsWith("session.")) {
          sessionInfoByID.set(sessionID, eventInfo);
        }
        recordTranscriptEvent(sessionID, event);

        if (
          (event.type === "session.created" || event.type === "session.updated") &&
          eventInfo?.id
        ) {
          if (event.type === "session.created") {
            const previous = sessionStartInFlightById.get(eventInfo.id);
            if (previous) {
              previous.cancelled = true;
              previous.resolve();
            }
            sessionStartInFlightById.delete(eventInfo.id);
            sessionUpdateNoticeIds.delete(eventInfo.id);
          }
          if (eventInfo.parentID) {
            subagentSessionIds.add(eventInfo.id);
            topLevelSessionIds.delete(eventInfo.id);
          } else if (
            event.type === "session.created" ||
            Object.prototype.hasOwnProperty.call(eventInfo, "parentID")
          ) {
            subagentSessionIds.delete(eventInfo.id);
            topLevelSessionIds.add(eventInfo.id);
          }
        }

        // OpenCode's event callbacks are observational and are not awaited by
        // the host.  A delete event therefore cannot provide SessionEnd
        // durability: only clear in-memory adapter state here.  The supported
        // persistence point is Stop/session idle while OpenCode remains alive.
        if (event.type === "session.deleted") {
          if (sessionID) {
            clearSessionState(sessionID);
            forgetSessionJournal(sessionID);
          }
          subagentSessionIds.delete(sessionID);
          topLevelSessionIds.delete(sessionID);
          const pending = sessionStartInFlightById.get(sessionID);
          if (pending) {
            pending.cancelled = true;
            pending.resolve();
          }
          sessionStartInFlightById.delete(sessionID);
          sessionUpdateNoticeIds.delete(sessionID);
          return;
        }

        // Map OpenCode event types to aisuite hook types
        const eventMap = {
          "session.created": "session_start",
          "session.idle": "stop",
          "permission.asked": "permission_request",
          "permission.v2.asked": "permission_request",
        };
        const hookType = event.type === "session.status"
          ? (props.status && props.status.type === "idle" ? "stop" : null)
          : eventMap[event.type];
        if (!hookType) return;

        const matching = eventHooks.filter((h) => h.hook_type === hookType);
        if (matching.length === 0) return;
        const explicitParentId = props.parentID || eventInfo?.parentID;
        let sessionStartBarrier = null;
        if (hookType === "session_start" && sessionID) {
          let resolveSessionStart;
          const completion = new Promise((resolve) => {
            resolveSessionStart = resolve;
          });
          sessionStartBarrier = {
            completion,
            resolve: resolveSessionStart,
            cancelled: false,
          };
          sessionStartInFlightById.set(sessionID, sessionStartBarrier);
        }
        let followup = "";
        let materialized = null;
        let materializationElapsedMs = 0;
        let sessionInfo = eventInfo || (sessionID && sessionInfoByID.get(sessionID)) || null;
        const capturedTranscriptChanges = sessionID
          ? [...(transcriptChangesBySession.get(sessionID)?.values() || [])]
          : [];
        const hasProcessBaseline = sessionID && transcriptBaselinesBySession.has(sessionID);

        const transcriptHooks = matching.filter((hookDef) => hookMaterializationTimeoutMs(hookDef) > 0);
        if (sessionID && transcriptHooks.length > 0) {
          const materializationStartedAt = Date.now();
          const materializationTimeoutMs = Math.max(
            ...transcriptHooks.map(hookMaterializationTimeoutMs),
          );
          try {
            await runWithTimeout(async (signal) => {
              if (!sessionInfo) {
                try {
                  const currentSessionInfo = await readSessionInfo(input.client, sessionID, signal);
                  if (signal.aborted) {
                    throw new Error("OpenCode session capture was cancelled");
                  }
                  if (currentSessionInfo) {
                    sessionInfo = currentSessionInfo;
                    sessionInfoByID.set(sessionID, currentSessionInfo);
                  }
                } catch (err) {
                  if (signal.aborted) throw err;
                  console.error(`[aisuite-hooks] OpenCode session info lookup failed (ignored): ${err.message}`);
                }
              }
              if (signal.aborted) {
                throw new Error("OpenCode session capture was cancelled");
              }
              materialized = await materializeTranscript(
                input.client,
                sessionID,
                sessionInfo,
                signal,
                hasProcessBaseline ? capturedTranscriptChanges : null,
              );
              transcriptBaselinesBySession.add(sessionID);
              acknowledgeTranscriptChanges(sessionID, capturedTranscriptChanges);
            }, materializationTimeoutMs, "OpenCode transcript materialization");
          } catch (err) {
            console.error(`[aisuite-hooks] OpenCode transcript materialization failed (ignored): ${err.message}`);
          }
          materializationElapsedMs = Date.now() - materializationStartedAt;
        }

        if (hookType === "stop" && sessionID) {
          const previous = lastStopBySession.get(sessionID);
          const pairedLegacyEvent = previous && previous.eventType !== event.type;
          const sameSnapshot = materialized && previous && previous.snapshot === materialized.snapshot;
          const recentUnknownSnapshot = !materialized && previous && Date.now() - previous.timestamp < 1000;
          if (pairedLegacyEvent && (sameSnapshot || recentUnknownSnapshot)) {
            return;
          }
          lastStopBySession.set(sessionID, {
            eventType: event.type,
            snapshot: materialized && materialized.snapshot,
            timestamp: Date.now(),
          });
        }

        try {
          for (const hookDef of matching) {
            const declaredTimeoutMs = declaredHookTimeoutMs(hookDef);
            const isUpdateNotice = isUpdateNoticeStop(hookDef);
            if (isUpdateNotice && declaredTimeoutMs === null) {
              reportIgnoredUpdateNoticeError(
                "update-notice Stop requires a positive timeout; hook skipped",
              );
              continue;
            }
            const updateNoticeDeadline = isUpdateNotice
              ? performance.now() + declaredTimeoutMs
              : null;
            if (
              isUpdateNotice &&
              (explicitParentId || subagentSessionIds.has(sessionID) || !topLevelSessionIds.has(sessionID))
            ) {
              continue;
            }
            if (isUpdateNotice && boundedStopInFlightSessionIds.has(sessionID)) continue;
            if (isUpdateNotice) boundedStopInFlightSessionIds.add(sessionID);

            try {
              if (isUpdateNotice) {
                const pendingSessionStart = sessionStartInFlightById.get(sessionID);
                if (pendingSessionStart) {
                  await Promise.race([
                    pendingSessionStart.completion,
                    new Promise((resolve) =>
                      setTimeout(
                        resolve,
                        Math.max(0, updateNoticeDeadline - performance.now()),
                      ),
                    ),
                  ]);
                  if (
                    pendingSessionStart.cancelled ||
                    subagentSessionIds.has(sessionID) ||
                    !topLevelSessionIds.has(sessionID)
                  ) {
                    continue;
                  }
                }
              }

              const spawnSpec = resolveHookSpawn(hookDef);
              if (!spawnSpec.ok) {
                const message = `Event hook '${hookDef.hook_type}' ${spawnSpec.error} (ignored)`;
                if (isUpdateNotice) reportIgnoredUpdateNoticeError(message);
                else console.error(`[aisuite-hooks] ${message}`);
                continue;
              }

              const lifecycleCwd = input.directory || sessionInfo?.directory || process.cwd();
              const payload = hookType === "permission_request"
                ? buildPermissionRequestPayload(event, props, input.directory)
                : {
                    session_id: sessionID,
                    transcript_path: materialized && materialized.path,
                    is_background_agent: Boolean(sessionInfo && sessionInfo.parentID),
                    cwd: lifecycleCwd || null,
                    workspace_roots: lifecycleCwd ? [lifecycleCwd] : null,
                    hook_event_name: event.type,
                    recursion_active:
                      hookType === "stop" &&
                      Boolean(
                        explicitParentId ||
                        subagentSessionIds.has(sessionID) ||
                        !topLevelSessionIds.has(sessionID),
                      ),
                  };
              const materializationBudget = hookMaterializationTimeoutMs(hookDef) > 0
                ? materializationElapsedMs
                : 0;
              const normalBudget =
                hookTimeoutMs(hookDef) -
                materializationBudget;
              const remainingHookBudget = isUpdateNotice
                ? Math.min(normalBudget, Math.floor(updateNoticeDeadline - performance.now()))
                : normalBudget;
              if (remainingHookBudget !== null && remainingHookBudget <= 0) {
                if (isUpdateNotice) {
                  reportIgnoredUpdateNoticeError("update-notice Stop deadline exhausted; hook skipped");
                } else {
                  console.error("[aisuite-hooks] Stop deadline exhausted; hook skipped");
                }
                continue;
              }
              const stopEnvOverrides = isUpdateNotice
                ? {
                    [SESSION_UPDATE_NOTICE_ENV]:
                      sessionUpdateNoticeIds.get(sessionID) || null,
                  }
                : null;
              const result = await runHookCommand(
                spawnSpec,
                payload,
                remainingHookBudget,
                stopEnvOverrides,
              );
              const updateNoticeId = result?.env?.[SESSION_UPDATE_NOTICE_ENV];
              if (
                hookType === "session_start" &&
                sessionID &&
                topLevelSessionIds.has(sessionID) &&
                sessionStartInFlightById.get(sessionID) === sessionStartBarrier &&
                typeof updateNoticeId === "string" &&
                SESSION_UPDATE_NOTICE_RE.test(updateNoticeId)
              ) {
                sessionUpdateNoticeIds.set(sessionID, updateNoticeId);
              }
              if (hookType === "stop" && !followup) {
                followup = followupText(result);
              }
            } catch (err) {
              const message = `Event hook '${hookDef.hook_type}' error (ignored): ${err.message}`;
              if (isUpdateNotice) reportIgnoredUpdateNoticeError(message);
              else console.error(`[aisuite-hooks] ${message}`);
            } finally {
              if (isUpdateNotice) boundedStopInFlightSessionIds.delete(sessionID);
            }
          }
        } finally {
          if (hookType === "session_start" && sessionStartBarrier) {
            sessionStartBarrier.resolve();
            if (sessionStartInFlightById.get(sessionID) === sessionStartBarrier) {
              sessionStartInFlightById.delete(sessionID);
            }
          }
        }

        if (hookType === "stop") {
          await injectStopFollowup(input.client, sessionID, followup);
        }
      };
    }

    // ── shell.env ────────────────────────────────────────────────
    const envVars = options?.env || {};
    if (Object.keys(envVars).length > 0) {
      hooks["shell.env"] = async (input, output) => {
        const scalars = { ...envVars };
        const managedPath = scalars.PATH;
        delete scalars.PATH;
        let livePath = output.env.PATH;
        if (livePath === undefined) {
          livePath = process.env.PATH;
        }
        Object.assign(output.env, scalars);
        if (managedPath) {
          output.env.PATH = prependPath(managedPath, livePath);
        }
      };
    }

    return hooks;
  },
};
