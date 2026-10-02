import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, rename, stat, truncate, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// The persisted wire format is documented in opencode-session-journal.md.
const FORMAT_VERSION = 2;
const READABLE_FORMAT_VERSIONS = new Set([1, FORMAT_VERSION]);
const LOCK_WAIT_MS = 1000;
const LOCK_STALE_MS = 30000;
const LOCK_POLL_MS = 20;

const CHECKPOINT_BEGIN = "opencode.checkpoint.begin";
const CHECKPOINT_COMMIT = "opencode.checkpoint.commit";
const SESSION_SNAPSHOT = "opencode.session.snapshot";
const SESSION_SNAPSHOT_CHUNK = "opencode.session.snapshot.chunk";
const MESSAGE_SNAPSHOT = "opencode.message.snapshot";
const MESSAGE_SNAPSHOT_CHUNK = "opencode.message.snapshot.chunk";
const MESSAGE_DELETED = "opencode.message.deleted";
const MAX_JOURNAL_RECORD_BYTES = 512 * 1024;
const MAX_STRING_CHUNK_CHARS = 32 * 1024;

const sessionQueues = new Map();
const latestSessionCaptures = new Map();
const journalStateCache = new Map();

function captureCancelledError() {
  return new Error("OpenCode session capture was cancelled");
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw captureCancelledError();
  }
}

export async function awaitSDKResponse(responsePromise, signal) {
  throwIfAborted(signal);
  if (!signal) {
    return responsePromise;
  }
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(captureCancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([responsePromise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function sleep(delayMs, signal) {
  throwIfAborted(signal);
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(captureCancelledError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) {
        result[key] = stableValue(value[key]);
      }
    }
    return result;
  }
  return value;
}

function stableJSON(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function userStateRoot() {
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(stateHome, "yandex-aisuite");
}

function journalDirectory(sessionID) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(sessionID)) {
    throw new Error("OpenCode session id is not a safe local-storage key");
  }
  return join(userStateRoot(), "session", sessionID, "opencode");
}

function journalPath(sessionID) {
  // Keep the original name so an AISuite upgrade does not invalidate the
  // LocalStorage byte offset already associated with this agent session.
  return join(journalDirectory(sessionID), "transcript.jsonl");
}

function journalStatePath(sessionID) {
  return join(journalDirectory(sessionID), "transcript.state.json");
}

export function unwrapSDKData(response) {
  if (response && typeof response === "object" && "data" in response) {
    return response.data;
  }
  return response;
}

function openCodeMessageID(message) {
  if (!message || typeof message !== "object") return "";
  if (message.info && typeof message.info.id === "string") return message.info.id;
  return typeof message.id === "string" ? message.id : "";
}

async function acquireJournalLock(lockPath, signal) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (true) {
    throwIfAborted(signal);
    try {
      const handle = await open(
        lockPath,
        fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        0o600,
      );
      try {
        await handle.writeFile(`${process.pid}\n`);
        return handle;
      } catch (err) {
        await handle.close();
        await unlink(lockPath).catch(() => {});
        throw err;
      }
    } catch (err) {
      if (!err || err.code !== "EEXIST") throw err;
      try {
        const info = await stat(lockPath);
        throwIfAborted(signal);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await unlink(lockPath);
          throwIfAborted(signal);
          continue;
        }
      } catch (statErr) {
        if (statErr && statErr.code !== "ENOENT") throw statErr;
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`OpenCode session journal lock timed out after ${LOCK_WAIT_MS}ms`);
      }
      await sleep(LOCK_POLL_MS, signal);
    }
  }
}

async function withJournalLock(lockPath, action, signal) {
  const lock = await acquireJournalLock(lockPath, signal);
  try {
    throwIfAborted(signal);
    return await action();
  } finally {
    await lock.close();
    try {
      await unlink(lockPath);
    } catch (err) {
      if (!err || err.code !== "ENOENT") throw err;
    }
  }
}

function emptyState() {
  return {
    hasCommittedCheckpoint: false,
    sessionInfo: null,
    sessionRevision: "",
    messages: new Map(),
    checkpointID: "",
    sourceStateHash: "",
    terminal: false,
  };
}

function cloneState(state) {
  return {
    ...state,
    messages: new Map(
      [...state.messages.entries()].map(([id, value]) => [id, { ...value }]),
    ),
  };
}

function clonedJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

function stringLeaves(value, path = [], result = []) {
  if (typeof value === "string") {
    result.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => stringLeaves(item, [...path, index], result));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      stringLeaves(item, [...path, key], result);
    }
  }
  return result;
}

function valueAtPath(value, path) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) {
      throw new Error("OpenCode session journal chunk path is invalid");
    }
    current = current[key];
  }
  return current;
}

function replaceAtPath(value, path, replacement) {
  if (path.length === 0) {
    throw new Error("OpenCode session journal cannot chunk the message root");
  }
  const parent = valueAtPath(value, path.slice(0, -1));
  parent[path.at(-1)] = replacement;
}

function splitStringForUpload(value) {
  if (!value) return [""];
  const result = [];
  for (let offset = 0; offset < value.length; offset += MAX_STRING_CHUNK_CHARS) {
    result.push(value.slice(offset, offset + MAX_STRING_CHUNK_CHARS));
  }
  return result;
}

function chunkPayload(path, value) {
  const keys = path.filter((item) => typeof item === "string" && item);
  return keys.reduceRight((payload, key) => ({ [key]: payload }), value);
}

function chunkPayloadValue(record) {
  if (!record.value || typeof record.value !== "object" || Array.isArray(record.value)) {
    throw new Error("OpenCode session journal has an invalid snapshot chunk value");
  }
  let current = record.value;
  while (current && typeof current === "object" && !Array.isArray(current)) {
    const values = Object.values(current);
    if (values.length !== 1) {
      throw new Error("OpenCode session journal has an invalid snapshot chunk value");
    }
    [current] = values;
  }
  if (typeof current !== "string") {
    throw new Error("OpenCode session journal has an invalid snapshot chunk value");
  }
  return current;
}

function chunkTargetAtPath(value, path) {
  let current = value;
  for (const key of path) {
    if (current === "<redacted>") return { redacted: true, value: current };
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) {
      throw new Error("OpenCode session journal chunk path is invalid");
    }
    current = current[key];
  }
  return { redacted: current === "<redacted>", value: current };
}

function boundedSnapshotRecords(snapshot, valueField, chunkType, identity) {
  if (Buffer.byteLength(JSON.stringify(snapshot)) < MAX_JOURNAL_RECORD_BYTES) return [snapshot];

  const chunks = [];
  const leaves = stringLeaves(snapshot[valueField]).sort((left, right) => right.value.length - left.value.length);
  for (const leaf of leaves) {
    if (Buffer.byteLength(JSON.stringify(snapshot)) < MAX_JOURNAL_RECORD_BYTES) break;
    const chunkID = sha256(
      stableJSON({
        checkpoint_id: snapshot.checkpoint_id,
        snapshot_type: snapshot.type,
        identity,
        path: leaf.path,
      }),
    );
    const values = splitStringForUpload(leaf.value);
    replaceAtPath(snapshot[valueField], leaf.path, null);
    snapshot.chunked_strings ||= [];
    snapshot.chunked_strings.push({ chunk_id: chunkID, path: leaf.path });
    for (let index = 0; index < values.length; index++) {
      const record = {
        type: chunkType,
        checkpoint_id: snapshot.checkpoint_id,
        ...identity,
        chunk_id: chunkID,
        path: leaf.path,
        chunk_index: index,
        chunk_count: values.length,
        value: chunkPayload(leaf.path, values[index]),
      };
      if (Buffer.byteLength(JSON.stringify(record)) >= MAX_JOURNAL_RECORD_BYTES) {
        throw new Error("OpenCode session journal snapshot chunk exceeds the physical record limit");
      }
      chunks.push(record);
    }
  }
  if (Buffer.byteLength(JSON.stringify(snapshot)) >= MAX_JOURNAL_RECORD_BYTES) {
    throw new Error("OpenCode session journal snapshot cannot be represented by bounded records");
  }
  return [snapshot, ...chunks];
}

function matchesIdentity(record, identity) {
  return Object.entries(identity).every(([key, value]) => record[key] === value);
}

function expandSnapshotValue(snapshot, records, valueField, chunkType, identity) {
  const value = clonedJSON(snapshot[valueField]);
  const chunksByID = new Map();
  for (const record of records) {
    if (record.type !== chunkType || !matchesIdentity(record, identity)) {
      continue;
    }
    if (
      typeof record.chunk_id !== "string" ||
      !Array.isArray(record.path) ||
      !Number.isInteger(record.chunk_index) ||
      !Number.isInteger(record.chunk_count) ||
      record.chunk_index < 0 ||
      record.chunk_count <= 0 ||
      record.chunk_index >= record.chunk_count
    ) {
      throw new Error("OpenCode session journal has invalid snapshot chunk metadata");
    }
    const group = chunksByID.get(record.chunk_id) || {
      path: record.path,
      count: record.chunk_count,
      values: new Map(),
    };
    if (stableJSON(group.path) !== stableJSON(record.path) || group.count !== record.chunk_count) {
      throw new Error("OpenCode session journal has inconsistent snapshot chunks");
    }
    if (group.values.has(record.chunk_index)) {
      throw new Error("OpenCode session journal contains a duplicate snapshot chunk");
    }
    group.values.set(record.chunk_index, chunkPayloadValue(record));
    chunksByID.set(record.chunk_id, group);
  }

  const descriptors = snapshot.chunked_strings || [];
  if (!Array.isArray(descriptors) || descriptors.length !== chunksByID.size) {
    throw new Error("OpenCode session journal snapshot chunks are incomplete");
  }
  const descriptorIDs = new Set();
  for (const descriptor of descriptors) {
    if (
      !descriptor ||
      typeof descriptor !== "object" ||
      typeof descriptor.chunk_id !== "string" ||
      !Array.isArray(descriptor.path) ||
      descriptorIDs.has(descriptor.chunk_id)
    ) {
      throw new Error("OpenCode session journal snapshot chunk descriptor is invalid");
    }
    descriptorIDs.add(descriptor.chunk_id);
    const chunkID = descriptor.chunk_id;
    const group = chunksByID.get(chunkID);
    if (!group) throw new Error("OpenCode session journal snapshot chunks are incomplete");
    const target = chunkTargetAtPath(value, group.path);
    if (stableJSON(group.path) !== stableJSON(descriptor.path) || (!target.redacted && target.value !== null)) {
      throw new Error("OpenCode session journal snapshot chunk descriptor is inconsistent");
    }
    if (group.values.size !== group.count) {
      throw new Error("OpenCode session journal snapshot chunks are incomplete");
    }
    if (target.redacted) continue;
    const restored = Array.from({ length: group.count }, (_, index) => group.values.get(index)).join("");
    replaceAtPath(value, group.path, restored);
  }
  return value;
}

function sessionSnapshotRecords(checkpointID, revision, info) {
  return boundedSnapshotRecords(
    {
      type: SESSION_SNAPSHOT,
      checkpoint_id: checkpointID,
      revision,
      info: clonedJSON(info),
    },
    "info",
    SESSION_SNAPSHOT_CHUNK,
    {},
  );
}

function messageSnapshotRecords(checkpointID, message) {
  return boundedSnapshotRecords(
    {
      type: MESSAGE_SNAPSHOT,
      checkpoint_id: checkpointID,
      opencode_message_id: message.id,
      revision: message.revision,
      previous_message_id: message.previousMessageID,
      message: clonedJSON(message.message),
    },
    "message",
    MESSAGE_SNAPSHOT_CHUNK,
    { opencode_message_id: message.id },
  );
}

function expandSessionSnapshot(snapshot, records) {
  return expandSnapshotValue(snapshot, records, "info", SESSION_SNAPSHOT_CHUNK, {});
}

function expandMessageSnapshot(snapshot, records) {
  return expandSnapshotValue(
    snapshot,
    records,
    "message",
    MESSAGE_SNAPSHOT_CHUNK,
    { opencode_message_id: snapshot.opencode_message_id },
  );
}

function completeJournalLines(rawBuffer) {
  let completeBytes = rawBuffer.length;
  if (rawBuffer.length > 0 && rawBuffer[rawBuffer.length - 1] !== 0x0a) {
    const lastNewline = rawBuffer.lastIndexOf(0x0a);
    completeBytes = lastNewline < 0 ? 0 : lastNewline + 1;
  }
  const lines = [];
  let start = 0;
  while (start < completeBytes) {
    const newline = rawBuffer.indexOf(0x0a, start);
    if (newline < 0 || newline >= completeBytes) break;
    lines.push({
      text: rawBuffer.subarray(start, newline).toString("utf8"),
      endOffset: newline + 1,
    });
    start = newline + 1;
  }
  return { completeBytes, lines };
}

function applyCheckpointRecords(baseState, records, commit) {
  const state = cloneState(baseState);
  for (const record of records) {
    if (record.type === SESSION_SNAPSHOT) {
      if (
        typeof record.revision !== "string" ||
        !record.info ||
        typeof record.info !== "object" ||
        Array.isArray(record.info)
      ) {
        throw new Error("OpenCode session journal has an invalid session snapshot");
      }
      state.sessionInfo = expandSessionSnapshot(record, records);
      state.sessionRevision = record.revision;
      continue;
    }
    if (record.type === MESSAGE_SNAPSHOT) {
      const id = record.opencode_message_id;
      if (
        typeof id !== "string" ||
        !id ||
        typeof record.revision !== "string" ||
        (record.previous_message_id !== null && typeof record.previous_message_id !== "string") ||
        !record.message ||
        typeof record.message !== "object" ||
        Array.isArray(record.message)
      ) {
        throw new Error("OpenCode session journal has an invalid message snapshot");
      }
      state.messages.set(id, {
        active: true,
        message: expandMessageSnapshot(record, records),
        previousMessageID: record.previous_message_id,
        revision: record.revision,
      });
      continue;
    }
    if (record.type === MESSAGE_DELETED) {
      const id = record.opencode_message_id;
      if (typeof id !== "string" || !id) {
        throw new Error("OpenCode session journal has an invalid message tombstone");
      }
      const existing = state.messages.get(id);
      if (existing) {
        state.messages.set(id, { ...existing, active: false });
      } else {
        state.messages.set(id, {
          active: false,
          message: null,
          previousMessageID: null,
          revision: "",
        });
      }
    }
  }

  const activeMessages = orderedMessageEntries(state);
  if (!Number.isInteger(commit.message_count) || commit.message_count !== activeMessages.length) {
    throw new Error("OpenCode session journal checkpoint has an invalid message count");
  }
  const expectedStateHash = sourceStateHash(state.sessionRevision, activeMessages);
  if (commit.source_state_hash !== expectedStateHash) {
    throw new Error("OpenCode session journal checkpoint has an invalid source state hash");
  }
  state.hasCommittedCheckpoint = true;
  state.checkpointID = commit.checkpoint_id;
  state.sourceStateHash = expectedStateHash;
  state.terminal = commit.terminal === true;
  return state;
}

function parseJournal(rawBuffer) {
  const { completeBytes, lines } = completeJournalLines(rawBuffer);
  let state = emptyState();
  let pending = null;
  let committedBytes = 0;

  for (const { text: line, endOffset } of lines) {
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;

    // Pre-v1 records reuse the current type names, but identify a message with
    // message_id and do not belong to a transactional checkpoint.
    if (
      record.checkpoint_id === undefined &&
      typeof record.message_id === "string" &&
      (record.type === MESSAGE_SNAPSHOT || record.type === MESSAGE_DELETED)
    ) {
      continue;
    }

    if (record.type === CHECKPOINT_BEGIN) {
      pending =
        READABLE_FORMAT_VERSIONS.has(record.format_version) &&
        typeof record.checkpoint_id === "string" &&
        record.checkpoint_id
          ? { checkpointID: record.checkpoint_id, formatVersion: record.format_version, records: [] }
          : null;
      continue;
    }
    if (!pending || record.checkpoint_id !== pending.checkpointID) continue;

    if (record.type === CHECKPOINT_COMMIT) {
      if (record.format_version === pending.formatVersion) {
        try {
          const baseState = state.hasCommittedCheckpoint ? state : emptyState();
          state = applyCheckpointRecords(baseState, pending.records, record);
          committedBytes = endOffset;
        } catch {
          // A later valid checkpoint remains recoverable even if this one was
          // produced by an incompatible or interrupted plugin version.
        }
      }
      pending = null;
      continue;
    }
    pending.records.push(record);
  }
  return { committedBytes, completeBytes, state };
}

async function writeJournalState(sessionID, snapshot, ensureActive, signal) {
  const path = journalStatePath(sessionID);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  const serialized = `${JSON.stringify({ format_version: FORMAT_VERSION, session_id: sessionID, snapshot })}\n`;
  let file;
  try {
    ensureActive();
    file = await open(
      temporaryPath,
      fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_WRONLY,
      0o600,
    );
    await file.chmod(0o600);
    ensureActive();
    await file.writeFile(serialized, signal ? { signal } : undefined);
    ensureActive();
    await file.sync();
    await file.close();
    file = null;
    ensureActive();
    await rename(temporaryPath, path);
  } catch (err) {
    if (file) await file.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw err;
  }
}

function orderedMessageEntries(state) {
  const active = new Map(
    [...state.messages.entries()].filter(([, value]) => value.active),
  );
  if (active.size === 0) return [];

  const nextByPrevious = new Map();
  for (const [id, value] of active.entries()) {
    const previous = value.previousMessageID;
    if (previous !== null && !active.has(previous)) {
      throw new Error(`OpenCode session journal message '${id}' has a missing predecessor`);
    }
    if (nextByPrevious.has(previous)) {
      throw new Error("OpenCode session journal contains a branched message order");
    }
    nextByPrevious.set(previous, id);
  }

  const result = [];
  const visited = new Set();
  let id = nextByPrevious.get(null);
  while (id !== undefined) {
    if (visited.has(id)) {
      throw new Error("OpenCode session journal contains a message-order cycle");
    }
    visited.add(id);
    result.push({ id, ...active.get(id) });
    id = nextByPrevious.get(id);
  }
  if (visited.size !== active.size) {
    throw new Error("OpenCode session journal message order is disconnected");
  }
  return result;
}

function orderedMessages(state) {
  return orderedMessageEntries(state).map((message) => message.message);
}

function normalizedSessionInfo(sessionID, sessionInfo) {
  if (!sessionInfo || typeof sessionInfo !== "object" || Array.isArray(sessionInfo)) {
    return { id: sessionID };
  }
  if (typeof sessionInfo.id === "string" && sessionInfo.id !== sessionID) {
    throw new Error("OpenCode session info id does not match the hook session id");
  }
  return { ...sessionInfo, id: sessionID };
}

function currentMessages(messages) {
  const result = [];
  const seen = new Set();
  let previousMessageID = null;
  for (const message of messages) {
    const id = openCodeMessageID(message);
    if (!id) {
      throw new Error("OpenCode session journal message has no id");
    }
    if (seen.has(id)) {
      throw new Error(`OpenCode session journal contains duplicate message id '${id}'`);
    }
    seen.add(id);
    result.push({
      id,
      message,
      previousMessageID,
      revision: sha256(stableJSON(message)),
    });
    previousMessageID = id;
  }
  return result;
}

function currentMessagesFromChanges(state, changes) {
  const result = [];
  const consumed = new Set();
  let previousMessageID = null;
  for (const existing of orderedMessageEntries(state)) {
    if (changes.deleted.has(existing.id)) continue;
    const updated = changes.updated.get(existing.id);
    const message = updated || existing.message;
    result.push({
      id: existing.id,
      message,
      previousMessageID,
      revision: updated ? sha256(stableJSON(updated)) : existing.revision,
    });
    consumed.add(existing.id);
    previousMessageID = existing.id;
  }
  for (const [id, message] of changes.updated.entries()) {
    if (consumed.has(id) || changes.deleted.has(id)) continue;
    result.push({
      id,
      message,
      previousMessageID,
      revision: sha256(stableJSON(message)),
    });
    previousMessageID = id;
  }
  return result;
}

function committedState(previous, info, sessionRevision, current, checkpointID, stateHash, terminal) {
  const state = cloneState(previous);
  const activeIDs = new Set(current.map((message) => message.id));
  for (const [id, existing] of state.messages.entries()) {
    if (existing.active && !activeIDs.has(id)) {
      state.messages.set(id, { ...existing, active: false });
    }
  }
  for (const message of current) {
    const existing = state.messages.get(message.id);
    state.messages.set(message.id, {
      active: true,
      message: existing?.revision === message.revision
        ? existing.message
        : clonedJSON(message.message),
      previousMessageID: message.previousMessageID,
      revision: message.revision,
    });
  }
  state.hasCommittedCheckpoint = true;
  state.sessionInfo = info;
  state.sessionRevision = sessionRevision;
  state.checkpointID = checkpointID;
  state.sourceStateHash = stateHash;
  state.terminal = terminal;
  return state;
}

async function readJournalForAppend(path, sessionID) {
  let fileInfo = null;
  try {
    fileInfo = await stat(path);
  } catch (err) {
    if (!err || err.code !== "ENOENT") throw err;
  }
  const cached = journalStateCache.get(sessionID);
  if (cached && fileInfo && cached.size === fileInfo.size && cached.mtimeMs === fileInfo.mtimeMs) {
    return {
      parsed: {
        committedBytes: fileInfo.size,
        completeBytes: fileInfo.size,
        state: cloneState(cached.state),
      },
      rawLength: fileInfo.size,
    };
  }
  let raw = Buffer.alloc(0);
  if (fileInfo) raw = await readFile(path);
  return { parsed: parseJournal(raw), rawLength: raw.length };
}

async function cacheJournalState(path, sessionID, state) {
  const fileInfo = await stat(path);
  journalStateCache.set(sessionID, {
    size: fileInfo.size,
    mtimeMs: fileInfo.mtimeMs,
    state: cloneState(state),
  });
}

function sourceStateHash(sessionRevision, messages) {
  return sha256(
    stableJSON({
      session_revision: sessionRevision,
      messages: messages.map((message) => ({
        opencode_message_id: message.id,
        previous_message_id: message.previousMessageID,
        revision: message.revision,
      })),
    }),
  );
}

async function appendCheckpoint(sessionID, sessionInfo, fullMessages, changes, terminal, ensureActive, signal) {
  const path = journalPath(sessionID);
  ensureActive();
  await mkdir(journalDirectory(sessionID), { recursive: true, mode: 0o700 });
  ensureActive();
  return withJournalLock(`${path}.lock`, async () => {
    ensureActive();
    const { parsed, rawLength } = await readJournalForAppend(path, sessionID);
    ensureActive();
    if (parsed.committedBytes !== rawLength) {
      await truncate(path, parsed.committedBytes);
      ensureActive();
    }
    const info = normalizedSessionInfo(sessionID, sessionInfo);
    const sessionRevision = sha256(stableJSON(info));
    const current = fullMessages === null
      ? currentMessagesFromChanges(parsed.state, changes)
      : currentMessages(fullMessages);
    const currentByID = new Map(current.map((message) => [message.id, message]));
    const stateHash = sourceStateHash(sessionRevision, current);
    const forceFullCheckpoint = !parsed.state.hasCommittedCheckpoint;

    if (
      !forceFullCheckpoint &&
      parsed.state.sourceStateHash === stateHash &&
      (!terminal || parsed.state.terminal)
    ) {
      await writeJournalState(sessionID, stateHash, ensureActive, signal);
      ensureActive();
      await cacheJournalState(path, sessionID, parsed.state);
      return { path, snapshot: stateHash };
    }

    const checkpointID = sha256(
      stableJSON({ format_version: FORMAT_VERSION, session_id: sessionID, source_state_hash: stateHash, terminal }),
    );
    const records = [];

    // A first full snapshot can exceed the one-batch hook budget. Publish a
    // compact, independently recoverable session-info checkpoint first, so a
    // final oversized snapshot never leaves only a torn remote checkpoint.
    if (forceFullCheckpoint) {
      const bootstrapStateHash = sourceStateHash(sessionRevision, []);
      const bootstrapID = sha256(
        stableJSON({
          format_version: FORMAT_VERSION,
          session_id: sessionID,
          source_state_hash: bootstrapStateHash,
          bootstrap: true,
        }),
      );
      records.push(
        {
          type: CHECKPOINT_BEGIN,
          format_version: FORMAT_VERSION,
          checkpoint_id: bootstrapID,
          session_id: sessionID,
        },
        ...sessionSnapshotRecords(bootstrapID, sessionRevision, info),
        {
          type: CHECKPOINT_COMMIT,
          format_version: FORMAT_VERSION,
          checkpoint_id: bootstrapID,
          source_state_hash: bootstrapStateHash,
          message_count: 0,
          terminal: false,
        },
      );
    }

    records.push({
      type: CHECKPOINT_BEGIN,
      format_version: FORMAT_VERSION,
      checkpoint_id: checkpointID,
      session_id: sessionID,
    });

    if (!forceFullCheckpoint && parsed.state.sessionRevision !== sessionRevision) {
      records.push(...sessionSnapshotRecords(checkpointID, sessionRevision, info));
    }

    for (const message of current) {
      const existing = parsed.state.messages.get(message.id);
      if (
        forceFullCheckpoint ||
        !existing ||
        !existing.active ||
        existing.revision !== message.revision ||
        existing.previousMessageID !== message.previousMessageID
      ) {
        records.push(...messageSnapshotRecords(checkpointID, message));
      }
    }

    if (!forceFullCheckpoint) {
      for (const [id, existing] of parsed.state.messages.entries()) {
        if (existing.active && !currentByID.has(id)) {
          records.push({
            type: MESSAGE_DELETED,
            checkpoint_id: checkpointID,
            opencode_message_id: id,
          });
        }
      }
    }

    records.push({
      type: CHECKPOINT_COMMIT,
      format_version: FORMAT_VERSION,
      checkpoint_id: checkpointID,
      source_state_hash: stateHash,
      message_count: current.length,
      terminal,
    });
    const serializedRecords = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
    ensureActive();

    const file = await open(
      path,
      fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_WRONLY,
      0o600,
    );
    try {
      ensureActive();
      await file.chmod(0o600);
      ensureActive();
      await file.writeFile(serializedRecords, signal ? { signal } : undefined);
      ensureActive();
      await file.sync();
    } finally {
      await file.close();
    }
    ensureActive();
    await writeJournalState(sessionID, stateHash, ensureActive, signal);
    ensureActive();
    await cacheJournalState(
      path,
      sessionID,
      committedState(parsed.state, info, sessionRevision, current, checkpointID, stateHash, terminal),
    );
    return { path, snapshot: stateHash };
  }, signal);
}

function enqueueSession(sessionID, action) {
  const previous = sessionQueues.get(sessionID) || Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  sessionQueues.set(sessionID, current);
  return current.finally(() => {
    if (sessionQueues.get(sessionID) === current) {
      sessionQueues.delete(sessionID);
    }
  });
}

function ensureCurrentCapture(sessionID, capture, signal) {
  throwIfAborted(signal);
  if (latestSessionCaptures.get(sessionID) !== capture) {
    throw new Error("OpenCode session capture was superseded by a newer event");
  }
}

async function readSessionMessages(client, sessionID, capture, signal) {
  const messages = client?.session?.messages;
  if (typeof messages !== "function") {
    throw new Error("OpenCode client.session.messages is unavailable");
  }
  const result = unwrapSDKData(
    await awaitSDKResponse(messages.call(client.session, { path: { id: sessionID } }), signal),
  );
  ensureCurrentCapture(sessionID, capture, signal);
  if (!Array.isArray(result)) {
    throw new Error("OpenCode client.session.messages returned an invalid response");
  }
  return result;
}

function messageChanges(records) {
  const updated = new Set();
  const deleted = new Set();
  for (const record of records) {
    const messageID = typeof record?.message_id === "string" ? record.message_id : "";
    if (!messageID) continue;
    if (record.deleted === true) {
      updated.delete(messageID);
      deleted.add(messageID);
    } else {
      deleted.delete(messageID);
      updated.add(messageID);
    }
  }
  return { updated: [...updated], deleted };
}

function changedMessagesNeedFullHistory(sessionID, records) {
  const cached = journalStateCache.get(sessionID);
  if (!cached) return true;
  const changes = messageChanges(records);
  return changes.updated.some((messageID) => !cached.state.messages.get(messageID)?.active);
}

async function readChangedSessionMessages(client, sessionID, records, capture, signal) {
  const changes = messageChanges(records);
  if (changes.updated.length === 0) return { updated: new Map(), deleted: changes.deleted };
  const message = client?.session?.message;
  if (typeof message !== "function") {
    throw new Error("OpenCode client.session.message is unavailable");
  }
  const responses = await Promise.all(
    changes.updated.map((messageID) =>
      awaitSDKResponse(
        message.call(client.session, { path: { id: sessionID, messageID } }),
        signal,
      ),
    ),
  );
  ensureCurrentCapture(sessionID, capture, signal);
  const updated = new Map();
  for (let index = 0; index < changes.updated.length; index++) {
    const value = unwrapSDKData(responses[index]);
    const expectedID = changes.updated[index];
    if (!value || typeof value !== "object" || openCodeMessageID(value) !== expectedID) {
      throw new Error(`OpenCode client.session.message returned an invalid response for '${expectedID}'`);
    }
    updated.set(expectedID, value);
  }
  return { updated, deleted: changes.deleted };
}

export async function findExistingOpenCodeJournal(sessionID) {
  const path = journalPath(sessionID);
  let rawState;
  try {
    rawState = await readFile(journalStatePath(sessionID), "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
  let state;
  try {
    state = JSON.parse(rawState);
  } catch {
    return null;
  }
  if (
    !state ||
    state.format_version !== FORMAT_VERSION ||
    state.session_id !== sessionID ||
    typeof state.snapshot !== "string" ||
    !state.snapshot
  ) {
    return null;
  }
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) return null;
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
  return { path, snapshot: state.snapshot };
}

export function forgetOpenCodeSession(sessionID) {
  latestSessionCaptures.delete(sessionID);
  journalStateCache.delete(sessionID);
}

export async function captureOpenCodeSession(
  client,
  sessionID,
  sessionInfo,
  terminal = false,
  signal = undefined,
  changeRecords = null,
) {
  throwIfAborted(signal);
  const capture = {};
  latestSessionCaptures.set(sessionID, capture);
  const clearCapture = () => {
    if (latestSessionCaptures.get(sessionID) === capture) {
      latestSessionCaptures.delete(sessionID);
    }
  };
  signal?.addEventListener("abort", clearCapture, { once: true });
  try {
    const existing = await findExistingOpenCodeJournal(sessionID);
    let messages = null;
    let changes = null;
    if (existing && changeRecords !== null && !changedMessagesNeedFullHistory(sessionID, changeRecords)) {
      try {
        changes = await readChangedSessionMessages(client, sessionID, changeRecords, capture, signal);
      } catch (err) {
        throwIfAborted(signal);
        messages = await readSessionMessages(client, sessionID, capture, signal);
      }
    } else {
      messages = await readSessionMessages(client, sessionID, capture, signal);
    }
    return await enqueueSession(sessionID, async () => {
      const ensureActive = () => ensureCurrentCapture(sessionID, capture, signal);
      ensureActive();
      return appendCheckpoint(sessionID, sessionInfo, messages, changes, terminal, ensureActive, signal);
    });
  } finally {
    signal?.removeEventListener("abort", clearCapture);
    clearCapture();
  }
}

export function materializeOpenCodeExport(raw) {
  const rawBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  const { state } = parseJournal(rawBuffer);
  if (!state.hasCommittedCheckpoint || !state.sessionInfo) {
    throw new Error("OpenCode session journal has no committed recovery checkpoint");
  }
  return {
    checkpoint_id: state.checkpointID,
    source_state_hash: state.sourceStateHash,
    terminal: state.terminal,
    export: {
      info: state.sessionInfo,
      messages: orderedMessages(state),
    },
  };
}
