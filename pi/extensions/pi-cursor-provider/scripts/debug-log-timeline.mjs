#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const NOTABLE_EVENTS = [
  "http.chat.body",
  "chat.no_user_message",
  "http.chat.error",
  "chat.discard_checkpoint",
  "chat.resume_tool_results",
  "stream.tool_call_pause",
  "tool_resume.start",
  "tool_resume.partial_wait",
  "tool_resume.sent_result",
  "stream.client_close",
  "nonstream.client_close",
  "stream.checkpoint_committed",
  "nonstream.checkpoint_committed",
  "stream.bridge_close",
  "nonstream.bridge_close",
  "session.cleanup",
  "session.cleanup_all",
  "conversation.evict",
];

function usage() {
  console.log(`Usage:
  node scripts/debug-log-timeline.mjs [--latest] [--json] [log-file]
  npm run debug:timeline -- --latest
  npm run debug:timeline -- /path/to/pi-cursor-provider-debug-....log`);
}

function parseArgs(argv) {
  const args = { latest: false, json: false, help: false, file: undefined };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--latest") {
      args.latest = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!args.file) {
      args.file = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return args;
}

function findLatestLogFile() {
  const dir = tmpdir();
  const candidates = readdirSync(dir)
    .filter((name) => /^pi-cursor-provider-debug-.*\.log$/.test(name))
    .map((name) => ({ name, path: join(dir, name), mtimeMs: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));

  if (candidates.length === 0) {
    throw new Error(`No pi-cursor-provider debug logs found in ${dir}`);
  }

  return candidates[0].path;
}

function shorten(text, max = 72) {
  if (!text) return "";
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = Math.floor(ms % 1000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}.${String(millis).padStart(3, "0")}s`;
  if (minutes > 0) return `${minutes}m ${seconds}.${String(millis).padStart(3, "0")}s`;
  return `${seconds}.${String(millis).padStart(3, "0")}s`;
}

function formatDelta(tsMs, baseMs) {
  return `+${formatDuration(Math.max(0, tsMs - baseMs))}`;
}

function getTsMs(ts) {
  const value = Date.parse(ts);
  return Number.isNaN(value) ? 0 : value;
}

function shortId(id, max = 18) {
  const value = String(id ?? "?");
  if (value.length <= max) return value;
  const head = Math.max(6, Math.floor((max - 1) / 2));
  const tail = Math.max(4, max - head - 1);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatTool(exec) {
  if (!exec) return "tool";
  const name = exec.toolName ?? "tool";
  const id = exec.toolCallId ?? exec.execId ?? "?";
  return `${name}:${shortId(id)}`;
}

function parseLogFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const events = [];
  const parseErrors = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]?.trim();
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (!entry || typeof entry !== "object") continue;
      events.push(entry);
    } catch (error) {
      parseErrors.push({ line: i + 1, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return { events, lineCount: lines.filter((line) => line.trim()).length, parseErrors };
}

function summarize(events, filePath) {
  const counts = new Map();
  const requests = new Map();
  const requestOrder = [];
  const processEvents = [];
  const sessionIds = new Set();
  let firstTsMs = Number.POSITIVE_INFINITY;
  let lastTsMs = 0;

  function getRequest(requestId, ts) {
    let request = requests.get(requestId);
    if (!request) {
      request = {
        requestId,
        ts,
        tsMs: getTsMs(ts),
        model: undefined,
        stream: undefined,
        sessionId: undefined,
        messageCount: undefined,
        parsedTurns: undefined,
        parsedToolResults: undefined,
        parsedUserText: undefined,
        resumeToolResults: [],
        pendingBeforeResume: undefined,
        currentTurnUser: undefined,
        completedTurnCount: undefined,
        sentResults: [],
        partialWait: [],
        toolPauses: [],
        checkpointBuffered: 0,
        checkpointCommitted: undefined,
        discardCheckpoint: undefined,
        clientClosed: false,
        bridgeClose: undefined,
        error: undefined,
        noUserMessage: false,
      };
      requests.set(requestId, request);
      requestOrder.push(requestId);
    }
    return request;
  }

  for (const event of events) {
    const eventName = event.event ?? "<unknown>";
    counts.set(eventName, (counts.get(eventName) ?? 0) + 1);

    const tsMs = getTsMs(event.ts ?? "");
    if (tsMs > 0) {
      firstTsMs = Math.min(firstTsMs, tsMs);
      lastTsMs = Math.max(lastTsMs, tsMs);
    }

    const requestId = typeof event.requestId === "string" ? event.requestId : undefined;
    const req = requestId ? getRequest(requestId, event.ts) : undefined;

    switch (eventName) {
      case "proxy.start":
        processEvents.push({ ts: event.ts, tsMs, kind: eventName, detail: `port=${event.port}` });
        break;
      case "proxy.stop":
        processEvents.push({ ts: event.ts, tsMs, kind: eventName, detail: `port=${event.port}` });
        break;
      case "bridge.spawn":
        processEvents.push({ ts: event.ts, tsMs, kind: eventName, detail: `${event.rpcPath ?? "rpc"} ${event.unary ? "unary" : "stream"}` });
        break;
      case "bridge.start_run":
        processEvents.push({ ts: event.ts, tsMs, kind: eventName, detail: "upstream run started" });
        break;
      case "bridge.exit":
        processEvents.push({ ts: event.ts, tsMs, kind: eventName, detail: `exitCode=${event.exitCode}` });
        break;
      case "session.cleanup":
        processEvents.push({
          ts: event.ts,
          tsMs,
          kind: eventName,
          detail: `session=${event.sessionId ?? "<none>"} activeBridge=${Boolean(event.hasActiveBridge)} hadConversation=${Boolean(event.hadConversation)}`,
        });
        break;
      case "session.cleanup_all":
        processEvents.push({
          ts: event.ts,
          tsMs,
          kind: eventName,
          detail: `activeBridges=${event.activeBridgeCount ?? 0} conversations=${event.conversationCount ?? 0}`,
        });
        break;
      case "conversation.evict":
        processEvents.push({ ts: event.ts, tsMs, kind: eventName, detail: `key=${event.key ?? "?"}` });
        break;
      case "http.chat.body": {
        if (!req) break;
        req.model = event.body?.model;
        req.stream = Boolean(event.body?.stream);
        req.sessionId = event.body?.pi_session_id;
        req.messageCount = Array.isArray(event.body?.messages) ? event.body.messages.length : undefined;
        if (req.sessionId) sessionIds.add(req.sessionId);
        break;
      }
      case "chat.parsed_messages":
        if (!req) break;
        req.parsedTurns = Array.isArray(event.turns) ? event.turns.length : undefined;
        req.parsedToolResults = Array.isArray(event.toolResults) ? event.toolResults.length : undefined;
        req.parsedUserText = event.userText ?? undefined;
        break;
      case "chat.resume_tool_results":
        if (!req) break;
        req.resumeToolResults = Array.isArray(event.toolResults) ? event.toolResults : [];
        req.pendingBeforeResume = Array.isArray(event.pendingExecs) ? event.pendingExecs.length : undefined;
        break;
      case "chat.discard_checkpoint":
        if (!req) break;
        req.discardCheckpoint = shorten(JSON.stringify({
          storedTurnCount: event.storedCheckpointTurnCount,
          currentTurnCount: event.currentTurnCount,
          storedFingerprint: event.storedCheckpointHistoryFingerprint,
          currentFingerprint: event.currentHistoryFingerprint,
        }), 120);
        break;
      case "chat.no_user_message":
        if (!req) break;
        req.noUserMessage = true;
        break;
      case "http.chat.error":
        if (!req) break;
        req.error = shorten(event.message ?? "unknown error", 120);
        break;
      case "stream.writer_start":
      case "nonstream.start":
        if (!req) break;
        req.currentTurnUser = event.currentTurn?.userText ?? req.currentTurnUser;
        req.completedTurnCount = event.completedTurnCount ?? req.completedTurnCount;
        break;
      case "tool_resume.sent_result":
        if (!req) break;
        req.sentResults.push(event.exec?.toolCallId ?? event.exec?.execId ?? "?");
        break;
      case "tool_resume.partial_wait":
        if (!req) break;
        req.partialWait = Array.isArray(event.unresolvedExecs) ? event.unresolvedExecs.map(formatTool) : [];
        break;
      case "stream.tool_call_pause":
        if (!req) break;
        req.toolPauses.push(formatTool(event.exec));
        break;
      case "stream.checkpoint_buffered":
      case "nonstream.checkpoint_buffered":
        if (!req) break;
        req.checkpointBuffered += 1;
        break;
      case "stream.client_close":
      case "nonstream.client_close":
        if (!req) break;
        req.clientClosed = true;
        break;
      case "stream.bridge_close":
      case "nonstream.bridge_close":
        if (!req) break;
        req.bridgeClose = {
          code: event.code ?? undefined,
          cancelled: Boolean(event.cancelled),
          mcpExecReceived: Boolean(event.mcpExecReceived),
          nonStreamError: event.nonStreamError ?? undefined,
        };
        break;
      case "stream.checkpoint_committed":
      case "nonstream.checkpoint_committed":
        if (!req) break;
        req.checkpointCommitted = {
          turnCount: event.stored?.checkpointTurnCount,
          sessionScoped: event.stored?.sessionScoped,
          conversationId: event.stored?.conversationId,
        };
        break;
      default:
        break;
    }
  }

  const summary = {
    filePath,
    fileName: basename(filePath),
    eventCount: events.length,
    firstTs: Number.isFinite(firstTsMs) ? new Date(firstTsMs).toISOString() : undefined,
    lastTs: lastTsMs ? new Date(lastTsMs).toISOString() : undefined,
    durationMs: Number.isFinite(firstTsMs) && lastTsMs ? Math.max(0, lastTsMs - firstTsMs) : 0,
    requestCount: requestOrder.length,
    sessionIds: Array.from(sessionIds).sort(),
    counts: Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    notableCounts: Object.fromEntries(NOTABLE_EVENTS.map((name) => [name, counts.get(name) ?? 0]).filter(([, count]) => count > 0)),
    requests: requestOrder.map((requestId) => requests.get(requestId)),
    processEvents: processEvents.sort((a, b) => a.tsMs - b.tsMs),
  };

  return summary;
}

function renderRequestLine(request, baseTsMs) {
  const pieces = [];
  pieces.push(`[${formatDelta(request.tsMs, baseTsMs)}] ${request.requestId}`);
  pieces.push(request.stream ? "stream" : "non-stream");
  if (request.model) pieces.push(`model=${request.model}`);
  if (request.sessionId) pieces.push(`session=${request.sessionId}`);
  if (typeof request.messageCount === "number") pieces.push(`msgs=${request.messageCount}`);

  const turnText = request.currentTurnUser || request.parsedUserText;
  if (typeof request.parsedTurns === "number" || typeof request.parsedToolResults === "number") {
    const parsedBits = [];
    if (typeof request.parsedTurns === "number") parsedBits.push(`turns=${request.parsedTurns}`);
    if (typeof request.parsedToolResults === "number") parsedBits.push(`toolResults=${request.parsedToolResults}`);
    if (turnText) parsedBits.push(`turn=${JSON.stringify(shorten(turnText, 48))}`);
    pieces.push(`parsed(${parsedBits.join(", ")})`);
  } else if (turnText) {
    pieces.push(`turn=${JSON.stringify(shorten(turnText, 48))}`);
  }

  if (request.discardCheckpoint) pieces.push(`discardCheckpoint=${request.discardCheckpoint}`);
  if (request.noUserMessage) pieces.push("NO_USER_MESSAGE");
  if (request.error) pieces.push(`error=${JSON.stringify(request.error)}`);

  if (request.resumeToolResults.length > 0 || typeof request.pendingBeforeResume === "number") {
    const ids = request.resumeToolResults
      .map((result) => result?.toolCallId)
      .filter(Boolean)
      .slice(0, 3)
      .map((id) => shortId(id));
    const suffix = request.resumeToolResults.length > ids.length ? `,+${request.resumeToolResults.length - ids.length}` : "";
    pieces.push(`resume(results=${request.resumeToolResults.length}, pendingBefore=${request.pendingBeforeResume ?? "?"}${ids.length ? `, ids=[${ids.join(",")}${suffix}]` : ""})`);
  }

  if (request.sentResults.length > 0) {
    const preview = request.sentResults.slice(0, 3).map((id) => shortId(id)).join(",");
    const suffix = request.sentResults.length > 3 ? `,+${request.sentResults.length - 3}` : "";
    pieces.push(`sent=${request.sentResults.length}[${preview}${suffix}]`);
  }

  if (request.partialWait.length > 0) {
    const preview = request.partialWait.slice(0, 4).join(",");
    const suffix = request.partialWait.length > 4 ? `,+${request.partialWait.length - 4}` : "";
    pieces.push(`partialWait=[${preview}${suffix}]`);
  }

  if (request.toolPauses.length > 0) {
    const preview = request.toolPauses.slice(0, 4).join(",");
    const suffix = request.toolPauses.length > 4 ? `,+${request.toolPauses.length - 4}` : "";
    pieces.push(`toolPause=[${preview}${suffix}]`);
  }

  if (request.checkpointBuffered > 0) pieces.push(`checkpointBuffered=${request.checkpointBuffered}`);
  if (request.clientClosed) pieces.push("clientClosed=true");

  if (request.bridgeClose) {
    const bridgeBits = [];
    if (request.bridgeClose.code !== undefined) bridgeBits.push(`code=${request.bridgeClose.code}`);
    bridgeBits.push(`cancelled=${request.bridgeClose.cancelled}`);
    if (request.bridgeClose.mcpExecReceived) bridgeBits.push("mcpExecReceived=true");
    if (request.bridgeClose.nonStreamError) bridgeBits.push(`error=${JSON.stringify(shorten(request.bridgeClose.nonStreamError, 64))}`);
    pieces.push(`bridgeClose(${bridgeBits.join(", ")})`);
  }

  if (request.checkpointCommitted) {
    pieces.push(`checkpointCommitted(turns=${request.checkpointCommitted.turnCount ?? "?"}, sessionScoped=${request.checkpointCommitted.sessionScoped})`);
  }

  return pieces.join("  |  ");
}

function render(summary, lineCount, parseErrors) {
  const baseTsMs = summary.firstTs ? Date.parse(summary.firstTs) : 0;
  const output = [];

  output.push(`File: ${summary.filePath}`);
  output.push(`Lines: ${lineCount} JSON entries: ${summary.eventCount}`);
  output.push(`Window: ${summary.firstTs ?? "?"} → ${summary.lastTs ?? "?"} (${formatDuration(summary.durationMs)})`);
  output.push(`Requests: ${summary.requestCount}`);
  output.push(`Sessions: ${summary.sessionIds.length > 0 ? summary.sessionIds.join(", ") : "<none>"}`);

  if (parseErrors.length > 0) {
    output.push(`Parse errors: ${parseErrors.length}`);
    for (const err of parseErrors.slice(0, 5)) {
      output.push(`  - line ${err.line}: ${err.message}`);
    }
  }

  output.push("");
  output.push("Notable event counts:");
  const notableEntries = Object.entries(summary.notableCounts);
  if (notableEntries.length === 0) {
    output.push("  (none)");
  } else {
    for (const [name, count] of notableEntries) {
      output.push(`  ${String(count).padStart(4, " ")}  ${name}`);
    }
  }

  if (summary.processEvents.length > 0) {
    output.push("");
    output.push("Process / lifecycle:");
    for (const event of summary.processEvents) {
      output.push(`  [${formatDelta(event.tsMs, baseTsMs)}] ${event.kind}${event.detail ? `  ${event.detail}` : ""}`);
    }
  }

  output.push("");
  output.push("Request timeline:");
  for (const request of summary.requests) {
    output.push(`  ${renderRequestLine(request, baseTsMs)}`);
  }

  return output.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const target = args.file ? resolve(args.file) : findLatestLogFile();
  const { events, lineCount, parseErrors } = parseLogFile(target);
  const summary = summarize(events, target);

  if (args.json) {
    console.log(JSON.stringify({ ...summary, lineCount, parseErrors }, null, 2));
    return;
  }

  console.log(render(summary, lineCount, parseErrors));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exitCode = 1;
}
