import rawModels from "./cursor-models-raw.json";
import { afterEach, describe, expect, test } from "vitest";
import { EventEmitter } from "node:events";
import { request as httpRequest } from "node:http";
import { buildEffortMap, FALLBACK_MODELS, parseModelId, processModels, registerSessionLifecycleCleanup, supportsReasoningModelId } from "./index.ts";
import {
  resolveModelId,
  __testInternals,
  cleanupAllSessionState,
  cleanupSessionState,
  evictStaleConversations,
  deriveBridgeKey,
  deriveBridgeKeyFromSessionId,
  deriveConversationKey,
  deriveConversationKeyFromSessionId,
  derivePiSessionId,
  deterministicConversationId,
  buildCursorRequest,
  parseMessages,
  setBridgeFactoryForTests,

  startProxy,
  stopProxy,
  writeSSEStreamForTests,
} from "./proxy.ts";
import type { CursorModel, ParsedTurn } from "./proxy.ts";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  AgentClientMessageSchema,
  AgentRunRequestSchema,
  AgentServerMessageSchema,
  CancelActionSchema,
  ConversationActionSchema,
  ConversationStateStructureSchema,
  ConversationTurnStructureSchema,
  ConversationStepSchema,
  ExecServerMessageSchema,
  InteractionUpdateSchema,
  KvServerMessageSchema,
  McpArgsSchema,
  SetBlobArgsSchema,
  TextDeltaUpdateSchema,
  UserMessageSchema,
} from "./proto/agent_pb.ts";

afterEach(() => {
  stopProxy();
  setBridgeFactoryForTests();
  cleanupAllSessionState();
});

// ── Helper ──

function m(id: string, name?: string): CursorModel {
  return { id, name: name ?? id, reasoning: true, contextWindow: 200_000, maxTokens: 64_000 };
}

// ── parseModelId ──

describe("parseModelId", () => {
  test("plain model — no effort, no variant", () => {
    expect(parseModelId("composer-2")).toEqual({ base: "composer-2", effort: "", fast: false, thinking: false });
  });

  test("plain model with -fast suffix", () => {
    expect(parseModelId("composer-2-fast")).toEqual({ base: "composer-2", effort: "", fast: true, thinking: false });
  });

  test("model with effort suffix", () => {
    expect(parseModelId("gpt-5.4-medium")).toEqual({ base: "gpt-5.4", effort: "medium", fast: false, thinking: false });
  });

  test("model with effort + fast", () => {
    expect(parseModelId("gpt-5.4-high-fast")).toEqual({ base: "gpt-5.4", effort: "high", fast: true, thinking: false });
  });

  test("model with effort + thinking", () => {
    expect(parseModelId("claude-4.6-opus-high-thinking")).toEqual({ base: "claude-4.6-opus", effort: "high", fast: false, thinking: true });
  });

  test("max effort level", () => {
    expect(parseModelId("claude-4.6-opus-max")).toEqual({ base: "claude-4.6-opus", effort: "max", fast: false, thinking: false });
  });

  test("max effort + thinking", () => {
    expect(parseModelId("claude-4.6-opus-max-thinking")).toEqual({ base: "claude-4.6-opus", effort: "max", fast: false, thinking: true });
  });

  test("none effort level", () => {
    expect(parseModelId("gpt-5.4-mini-none")).toEqual({ base: "gpt-5.4-mini", effort: "none", fast: false, thinking: false });
  });

  test("xhigh effort", () => {
    expect(parseModelId("gpt-5.2-xhigh")).toEqual({ base: "gpt-5.2", effort: "xhigh", fast: false, thinking: false });
  });

  test("xhigh effort + fast", () => {
    expect(parseModelId("gpt-5.2-xhigh-fast")).toEqual({ base: "gpt-5.2", effort: "xhigh", fast: true, thinking: false });
  });

  test("codex-max model — max is part of base, not effort", () => {
    expect(parseModelId("gpt-5.1-codex-max-high")).toEqual({ base: "gpt-5.1-codex-max", effort: "high", fast: false, thinking: false });
  });

  test("codex-max + fast", () => {
    expect(parseModelId("gpt-5.1-codex-max-medium-fast")).toEqual({ base: "gpt-5.1-codex-max", effort: "medium", fast: true, thinking: false });
  });

  test("codex-mini model", () => {
    expect(parseModelId("gpt-5.1-codex-mini-high")).toEqual({ base: "gpt-5.1-codex-mini", effort: "high", fast: false, thinking: false });
  });

  test("spark-preview model", () => {
    expect(parseModelId("gpt-5.3-codex-spark-preview-high")).toEqual({ base: "gpt-5.3-codex-spark-preview", effort: "high", fast: false, thinking: false });
  });

  test("plain thinking model — no effort", () => {
    expect(parseModelId("grok-4-20-thinking")).toEqual({ base: "grok-4-20", effort: "", fast: false, thinking: true });
  });

  test("model without any suffix", () => {
    expect(parseModelId("kimi-k2.5")).toEqual({ base: "kimi-k2.5", effort: "", fast: false, thinking: false });
  });

  test("default model", () => {
    expect(parseModelId("default")).toEqual({ base: "default", effort: "", fast: false, thinking: false });
  });

  test("claude-4.6-sonnet-medium — effort is medium", () => {
    expect(parseModelId("claude-4.6-sonnet-medium")).toEqual({ base: "claude-4.6-sonnet", effort: "medium", fast: false, thinking: false });
  });

  test("claude-4.6-sonnet-medium-thinking", () => {
    expect(parseModelId("claude-4.6-sonnet-medium-thinking")).toEqual({ base: "claude-4.6-sonnet", effort: "medium", fast: false, thinking: true });
  });
});

// ── buildEffortMap ──

describe("buildEffortMap", () => {
  test("full range: none/low/medium/high/xhigh", () => {
    const map = buildEffortMap(new Set(["none", "low", "medium", "high", "xhigh"]));
    expect(map).toEqual({ minimal: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh" });
  });

  test("with default (empty) and medium", () => {
    const map = buildEffortMap(new Set(["", "low", "medium", "high"]));
    expect(map).toEqual({ minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high" });
  });

  test("default without medium — medium maps to empty", () => {
    const map = buildEffortMap(new Set(["", "low", "high", "xhigh"]));
    expect(map.medium).toBe("");
  });

  test("high+max only — all lower levels clamp to high", () => {
    const map = buildEffortMap(new Set(["high", "max"]));
    expect(map).toEqual({ minimal: "high", low: "high", medium: "high", high: "high", xhigh: "max" });
  });

  test("none+low+medium+high+max", () => {
    const map = buildEffortMap(new Set(["none", "low", "medium", "high", "max"]));
    expect(map).toEqual({ minimal: "none", low: "low", medium: "medium", high: "high", xhigh: "max" });
  });

  test("low+high — medium falls back to low", () => {
    const map = buildEffortMap(new Set(["low", "high"]));
    expect(map).toEqual({ minimal: "low", low: "low", medium: "low", high: "high", xhigh: "high" });
  });
});

// ── processModels ──

describe("reasoning support", () => {
  test("derives reasoning from model ids", () => {
    expect(supportsReasoningModelId("gpt-5.4")).toBe(true);
    expect(supportsReasoningModelId("gpt-5.4-fast")).toBe(true);
    expect(supportsReasoningModelId("composer-2")).toBe(true);
    expect(supportsReasoningModelId("default")).toBe(true);
    expect(supportsReasoningModelId("totally-unknown-model")).toBe(false);
  });

  test("fallback models keep derived reasoning enabled", () => {
    expect(FALLBACK_MODELS.length).toBeGreaterThan(0);
    expect(FALLBACK_MODELS.find((model) => model.id === "gpt-5.4-medium")?.reasoning).toBe(true);
    expect(FALLBACK_MODELS.find((model) => model.id === "composer-2")?.reasoning).toBe(true);
  });
});

describe("processModels", () => {
  test("composer-2 — no effort variants, kept as-is", () => {
    const result = processModels([m("composer-2"), m("composer-2-fast")]);
    const c2 = result.find(r => r.id === "composer-2");
    const c2f = result.find(r => r.id === "composer-2-fast");
    expect(c2).toBeDefined();
    expect(c2!.supportsEffort).toBe(false);
    expect(c2f).toBeDefined();
    expect(c2f!.supportsEffort).toBe(false);
  });

  test("gpt-5.4 — deduped from low/medium/high/xhigh", () => {
    const result = processModels([
      m("gpt-5.4-low"), m("gpt-5.4-medium"), m("gpt-5.4-high"), m("gpt-5.4-xhigh"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gpt-5.4");
    expect(result[0].supportsEffort).toBe(true);
    expect(result[0].effortMap!.medium).toBe("medium");
    expect(result[0].effortMap!.xhigh).toBe("xhigh");
  });

  test("gpt-5.4-fast — deduped from effort+fast variants", () => {
    const result = processModels([
      m("gpt-5.4-high-fast"), m("gpt-5.4-medium-fast"), m("gpt-5.4-xhigh-fast"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gpt-5.4-fast");
    expect(result[0].supportsEffort).toBe(true);
  });

  test("gpt-5.2 — deduped from default + effort variants", () => {
    const result = processModels([
      m("gpt-5.2"), m("gpt-5.2-high"), m("gpt-5.2-low"), m("gpt-5.2-xhigh"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gpt-5.2");
    expect(result[0].supportsEffort).toBe(true);
    expect(result[0].effortMap!.medium).toBe(""); // no-suffix = default
    expect(result[0].effortMap!.high).toBe("high");
  });

  test("gpt-5.4-mini — has none effort", () => {
    const result = processModels([
      m("gpt-5.4-mini-low"), m("gpt-5.4-mini-medium"), m("gpt-5.4-mini-high"),
      m("gpt-5.4-mini-xhigh"), m("gpt-5.4-mini-none"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gpt-5.4-mini");
    expect(result[0].supportsEffort).toBe(true);
    expect(result[0].effortMap!.minimal).toBe("none");
  });

  test("claude-4.6-opus — high+max deduped, effort clamped to lowest", () => {
    const result = processModels([
      m("claude-4.6-opus-high"), m("claude-4.6-opus-max"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("claude-4.6-opus");
    expect(result[0].supportsEffort).toBe(true);
    expect(result[0].effortMap!.minimal).toBe("high");
    expect(result[0].effortMap!.low).toBe("high");
    expect(result[0].effortMap!.medium).toBe("high");
    expect(result[0].effortMap!.high).toBe("high");
    expect(result[0].effortMap!.xhigh).toBe("max");
  });

  test("claude-4.6-opus-thinking — high+max thinking deduped", () => {
    const result = processModels([
      m("claude-4.6-opus-high-thinking"), m("claude-4.6-opus-max-thinking"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("claude-4.6-opus-thinking");
    expect(result[0].supportsEffort).toBe(true);
    expect(result[0].effortMap!.high).toBe("high");
    expect(result[0].effortMap!.xhigh).toBe("max");
  });

  test("claude-4.5-opus-high — single effort variant, deduped to base", () => {
    const result = processModels([m("claude-4.5-opus-high")]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("claude-4.5-opus");
    expect(result[0].supportsEffort).toBe(true);
    expect(result[0].effortMap!.high).toBe("high");
    expect(result[0].effortMap!.minimal).toBe("high");
  });

  test("claude-4.6-sonnet-medium — single effort variant, deduped to base", () => {
    const result = processModels([m("claude-4.6-sonnet-medium")]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("claude-4.6-sonnet");
    expect(result[0].supportsEffort).toBe(true);
    expect(result[0].effortMap!.medium).toBe("medium");
  });

  test("composer-2 — single model without effort, NOT deduped", () => {
    const result = processModels([m("composer-2")]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("composer-2");
    expect(result[0].supportsEffort).toBe(false);
  });

  test("gpt-5.1-codex-max — deduped, max stays in base name", () => {
    const result = processModels([
      m("gpt-5.1-codex-max-low"), m("gpt-5.1-codex-max-medium"),
      m("gpt-5.1-codex-max-high"), m("gpt-5.1-codex-max-xhigh"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gpt-5.1-codex-max");
    expect(result[0].supportsEffort).toBe(true);
  });

  test("gpt-5.3-codex-spark-preview — deduped", () => {
    const result = processModels([
      m("gpt-5.3-codex-spark-preview"), m("gpt-5.3-codex-spark-preview-high"),
      m("gpt-5.3-codex-spark-preview-low"), m("gpt-5.3-codex-spark-preview-xhigh"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gpt-5.3-codex-spark-preview");
    expect(result[0].supportsEffort).toBe(true);
  });

  test("standalone models pass through", () => {
    const result = processModels([
      m("default"), m("gemini-3-flash"), m("kimi-k2.5"), m("grok-4-20"), m("grok-4-20-thinking"),
    ]);
    expect(result).toHaveLength(5);
    expect(result.every(r => r.supportsEffort === false)).toBe(true);
  });

  test("uses representative name from medium variant", () => {
    const result = processModels([
      m("gpt-5.4-low", "GPT-5.4 1M Low"),
      m("gpt-5.4-medium", "GPT-5.4 1M"),
      m("gpt-5.4-high", "GPT-5.4 1M High"),
    ]);
    expect(result[0].name).toBe("GPT-5.4 1M");
  });

  test("uses representative name from default (no-suffix) variant", () => {
    const result = processModels([
      m("gpt-5.2", "GPT-5.2"),
      m("gpt-5.2-high", "GPT-5.2 High"),
      m("gpt-5.2-low", "GPT-5.2 Low"),
    ]);
    expect(result[0].name).toBe("GPT-5.2");
  });

  test("full raw model list dedup count", () => {
    const result = processModels(rawModels as CursorModel[]);
    // Should be significantly fewer than 83
    expect(result.length).toBeLessThan(50);
    expect(result.length).toBeGreaterThan(20);

    // Spot checks
    const composer2 = result.find(r => r.id === "composer-2");
    expect(composer2).toBeDefined();
    expect(composer2!.supportsEffort).toBe(false);

    const gpt54 = result.find(r => r.id === "gpt-5.4");
    expect(gpt54).toBeDefined();
    expect(gpt54!.supportsEffort).toBe(true);

    // Opus should be deduped too
    const opus46 = result.find(r => r.id === "claude-4.6-opus");
    expect(opus46).toBeDefined();
    expect(opus46!.supportsEffort).toBe(true);
    expect(result.find(r => r.id === "claude-4.6-opus-high")).toBeUndefined();
    expect(result.find(r => r.id === "claude-4.6-opus-max")).toBeUndefined();

    // No raw effort IDs should leak through for deduped models
    expect(result.find(r => r.id === "gpt-5.4-medium")).toBeUndefined();
    expect(result.find(r => r.id === "gpt-5.4-high")).toBeUndefined();
    expect(result.find(r => r.id === "gpt-5.2-low")).toBeUndefined();
  });
});

// ── resolveModelId ──

describe("resolveModelId", () => {
  test("no effort — returns model as-is", () => {
    expect(resolveModelId("composer-2")).toBe("composer-2");
    expect(resolveModelId("composer-2", undefined)).toBe("composer-2");
    expect(resolveModelId("composer-2", "")).toBe("composer-2");
  });

  test("plain model + effort", () => {
    expect(resolveModelId("gpt-5.4", "medium")).toBe("gpt-5.4-medium");
    expect(resolveModelId("gpt-5.4", "high")).toBe("gpt-5.4-high");
    expect(resolveModelId("gpt-5.4", "xhigh")).toBe("gpt-5.4-xhigh");
  });

  test("fast model + effort — inserts before -fast", () => {
    expect(resolveModelId("gpt-5.4-fast", "medium")).toBe("gpt-5.4-medium-fast");
    expect(resolveModelId("gpt-5.4-fast", "high")).toBe("gpt-5.4-high-fast");
  });

  test("thinking model + effort — inserts before -thinking", () => {
    expect(resolveModelId("claude-4.6-opus-thinking", "high")).toBe("claude-4.6-opus-high-thinking");
    expect(resolveModelId("claude-4.6-opus-thinking", "max")).toBe("claude-4.6-opus-max-thinking");
  });

  test("codex-max model + effort", () => {
    expect(resolveModelId("gpt-5.1-codex-max", "high")).toBe("gpt-5.1-codex-max-high");
    expect(resolveModelId("gpt-5.1-codex-max", "medium")).toBe("gpt-5.1-codex-max-medium");
  });

  test("codex-max-fast model + effort", () => {
    expect(resolveModelId("gpt-5.1-codex-max-fast", "high")).toBe("gpt-5.1-codex-max-high-fast");
  });

  test("spark-preview model + effort", () => {
    expect(resolveModelId("gpt-5.3-codex-spark-preview", "xhigh")).toBe("gpt-5.3-codex-spark-preview-xhigh");
  });
});

// ── Session key derivation ──

const msg = (role: "user" | "assistant" | "system", content: string) => ({ role, content });
const assistantStep = (text: string) => ({ kind: "assistantText", text } as const);
const toolStep = (
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  result?: { content: string; isError: boolean },
) => ({ kind: "toolCall", toolCallId, toolName, arguments: args, ...(result ? { result } : {}) } as const);
const turn = (userText: string, steps: ParsedTurn["steps"] = []): ParsedTurn => ({ userText, steps });

describe("deriveBridgeKey", () => {
  test("uses sessionId when provided", () => {
    const msgs = [msg("user", "hello")];
    const a = deriveBridgeKey(msgs, "session-abc");
    const b = deriveBridgeKey(msgs, "session-abc");
    expect(a).toBe(b);
  });

  test("different sessionIds produce different keys", () => {
    const msgs = [msg("user", "hello")];
    const a = deriveBridgeKey(msgs, "session-1");
    const b = deriveBridgeKey(msgs, "session-2");
    expect(a).not.toBe(b);
  });

  test("same sessionId ignores later messages", () => {
    const a = deriveBridgeKey([msg("user", "hello")], "session-1");
    const b = deriveBridgeKey([msg("user", "goodbye")], "session-1");
    expect(a).toBe(b);
  });

  test("falls back to first user message hash without sessionId", () => {
    const msgs1 = [msg("user", "hello")];
    const msgs2 = [msg("user", "hello"), msg("assistant", "hi"), msg("user", "bye")];
    expect(deriveBridgeKey(msgs1)).toBe(deriveBridgeKey(msgs2));
  });

  test("fallback differs by first user message", () => {
    const a = deriveBridgeKey([msg("user", "hello")]);
    const b = deriveBridgeKey([msg("user", "goodbye")]);
    expect(a).not.toBe(b);
  });
});

describe("deriveConversationKey", () => {
  test("same sessionId → same key regardless of messages", () => {
    const a = deriveConversationKey([msg("user", "hello")], "session-x");
    const b = deriveConversationKey([msg("user", "totally different")], "session-x");
    expect(a).toBe(b);
  });

  test("different sessionIds → different keys", () => {
    const a = deriveConversationKey([msg("user", "hello")], "session-1");
    const b = deriveConversationKey([msg("user", "hello")], "session-2");
    expect(a).not.toBe(b);
  });

  test("falls back to first user message hash without sessionId", () => {
    const a = deriveConversationKey([msg("user", "hello")]);
    const b = deriveConversationKey([msg("user", "hello"), msg("assistant", "hi")]);
    expect(a).toBe(b);
  });
});

describe("session cleanup", () => {
  function seedSessionState(sessionId: string) {
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const writes: Uint8Array[] = [];
    let ended = 0;
    const heartbeatTimer = setInterval(() => {}, 60_000);
    __testInternals.activeBridges.set(bridgeKey, {
      bridge: {
        get alive() { return true; },
        write(data: Uint8Array) { writes.push(data); },
        end() { ended++; },
        onData() {},
        onClose() {},
        proc: {} as any,
      } as any,
      heartbeatTimer,
      blobStore: new Map(),
      mcpTools: [],
      pendingExecs: [],
      currentTurn: turn("current"),
    });
    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });
    return { bridgeKey, convKey, writes, get ended() { return ended; } };
  }

  test("cleanupSessionState removes active bridge and conversation for the session", () => {
    const seeded = seedSessionState("session-a");
    cleanupSessionState("session-a");
    expect(__testInternals.activeBridges.has(seeded.bridgeKey)).toBe(false);
    expect(__testInternals.conversationStates.has(seeded.convKey)).toBe(false);
    expect(seeded.writes.length).toBe(1);
    expect(seeded.ended).toBe(1);
  });

  test("cleanupSessionState does not touch another session", () => {
    const a = seedSessionState("session-a");
    const b = seedSessionState("session-b");
    cleanupSessionState("session-a");
    expect(__testInternals.activeBridges.has(a.bridgeKey)).toBe(false);
    expect(__testInternals.conversationStates.has(a.convKey)).toBe(false);
    expect(__testInternals.activeBridges.has(b.bridgeKey)).toBe(true);
    expect(__testInternals.conversationStates.has(b.convKey)).toBe(true);
  });
});

describe("session cleanup hook wiring", () => {
  test("registerSessionLifecycleCleanup wires switch/fork/tree/shutdown to cleanup current session", async () => {
    const handlers = new Map<string, Function>();
    const pi = {
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      },
    } as any;

    registerSessionLifecycleCleanup(pi);

    const sessionId = "session-hook";
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const heartbeatTimer = setInterval(() => {}, 60_000);
    __testInternals.activeBridges.set(bridgeKey, {
      bridge: {
        get alive() { return false; },
        write() {},
        end() {},
        onData() {},
        onClose() {},
        proc: {} as any,
      } as any,
      heartbeatTimer,
      blobStore: new Map(),
      mcpTools: [],
      pendingExecs: [],
      currentTurn: turn("current"),
    });
    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });

    const ctx = { sessionManager: { getSessionId: () => sessionId } };
    for (const event of ["session_before_switch", "session_before_fork", "session_before_tree", "session_shutdown"]) {
      __testInternals.activeBridges.set(bridgeKey, {
        bridge: {
          get alive() { return false; },
          write() {},
          end() {},
          onData() {},
          onClose() {},
          proc: {} as any,
        } as any,
        heartbeatTimer,
        blobStore: new Map(),
        mcpTools: [],
        pendingExecs: [],
        currentTurn: turn("current"),
      });
      __testInternals.conversationStates.set(convKey, {
        conversationId: "conv",
        checkpoint: null,
  
  
        sessionScoped: true,
        blobStore: new Map(),
        lastAccessMs: Date.now(),
      });
      await handlers.get(event)?.({}, ctx);
      expect(__testInternals.activeBridges.has(bridgeKey)).toBe(false);
      expect(__testInternals.conversationStates.has(convKey)).toBe(false);
    }
  });
});

describe("session-scoped eviction policy", () => {
  test("evictStaleConversations keeps session-scoped state past TTL", () => {
    const convKey = deriveConversationKeyFromSessionId("session-ttl");
    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-session",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: 0,
    });

    evictStaleConversations(31 * 60 * 1000);
    expect(__testInternals.conversationStates.has(convKey)).toBe(true);
  });

  test("evictStaleConversations removes anonymous state past TTL", () => {
    const convKey = "anon-key";
    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-anon",
      checkpoint: null,


      sessionScoped: false,
      blobStore: new Map(),
      lastAccessMs: 0,
    });

    evictStaleConversations(31 * 60 * 1000);
    expect(__testInternals.conversationStates.has(convKey)).toBe(false);
  });

  test("cleanupSessionState still removes session-scoped state explicitly", () => {
    const sessionId = "session-explicit";
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-explicit",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: 0,
    });

    cleanupSessionState(sessionId);
    expect(__testInternals.conversationStates.has(convKey)).toBe(false);
  });
});

describe("derivePiSessionId", () => {
  test("prefers pi_session_id over user", () => {
    expect(derivePiSessionId({ pi_session_id: "a", user: "b" })).toBe("a");
  });

  test("falls back to user", () => {
    expect(derivePiSessionId({ user: "legacy" })).toBe("legacy");
  });

  test("trims whitespace", () => {
    expect(derivePiSessionId({ pi_session_id: "  x  " })).toBe("x");
  });

  test("returns undefined when empty", () => {
    expect(derivePiSessionId({ pi_session_id: "   ", user: "" })).toBeUndefined();
  });
});

// ── Turn reconstruction ──

function decodeRunRequest(payload: ReturnType<typeof buildCursorRequest>) {
  const clientMsg = fromBinary(AgentClientMessageSchema, payload.requestBytes);
  expect(clientMsg.message.case).toBe("runRequest");
  return clientMsg.message.value as InstanceType<typeof AgentRunRequestSchema["$typeName"]> & any;
}

function resolveBlob(data: Uint8Array, blobStore?: Map<string, Uint8Array>): Uint8Array {
  if (blobStore && data.length === 32) {
    const resolved = blobStore.get(Buffer.from(data).toString("hex"));
    if (resolved) return resolved;
  }
  return data;
}

function decodeTurns(state: any, blobStore?: Map<string, Uint8Array>) {
  return (state.turns as Uint8Array[]).map((turnRef: Uint8Array) => {
    const turnBytes = resolveBlob(turnRef, blobStore);
    const turnStruct = fromBinary(ConversationTurnStructureSchema, turnBytes);
    expect(turnStruct.turn.case).toBe("agentConversationTurn");
    const agentTurn = turnStruct.turn.value as any;
    const userMsg = fromBinary(UserMessageSchema, resolveBlob(agentTurn.userMessage, blobStore));
    const steps = (agentTurn.steps as Uint8Array[]).map((s: Uint8Array) => fromBinary(ConversationStepSchema, resolveBlob(s, blobStore)));
    return { userMsg, steps };
  });
}

describe("buildCursorRequest — turn reconstruction", () => {
  test("no checkpoint, no turns — empty turns array", () => {
    const payload = buildCursorRequest("gpt-5", "system", "hello", [], "conv-1", null);
    const req = decodeRunRequest(payload);
    expect(req.conversationState.turns).toHaveLength(0);
    const userAction = req.action.action.value as any;
    expect(userAction.userMessage.text).toBe("hello");
  });

  test("no checkpoint, with assistant-text turns — reconstructs protobuf turns without inline fallback", () => {
    const turns = [
      turn("first question", [assistantStep("first answer")]),
      turn("second question", [assistantStep("second answer")]),
    ];
    const payload = buildCursorRequest("gpt-5", "system", "third question", turns, "conv-1", null);
    const req = decodeRunRequest(payload);

    const decoded = decodeTurns(req.conversationState, payload.blobStore);
    expect(decoded).toHaveLength(2);

    expect(decoded[0].userMsg.text).toBe("first question");
    expect(decoded[0].steps).toHaveLength(1);
    expect(decoded[0].steps[0].message.case).toBe("assistantMessage");
    expect((decoded[0].steps[0].message.value as any).text).toBe("first answer");

    expect(decoded[1].userMsg.text).toBe("second question");
    expect(decoded[1].steps[0].message.case).toBe("assistantMessage");
    expect((decoded[1].steps[0].message.value as any).text).toBe("second answer");

    const userAction = req.action.action.value as any;
    expect(userAction.userMessage.text).toBe("third question");
    expect(userAction.userMessage.text).not.toContain("<conversation_history>");
  });

  test("no checkpoint, reconstructs tool-call steps and final assistant text", () => {
    const turns = [
      turn("inspect file", [
        toolStep("tc1", "read", { path: "src/index.ts" }, { content: "file contents", isError: false }),
        assistantStep("I found the issue."),
      ]),
    ];
    const payload = buildCursorRequest("gpt-5", "system", "fix it", turns, "conv-1", null);
    const req = decodeRunRequest(payload);
    const decoded = decodeTurns(req.conversationState, payload.blobStore);

    expect(decoded).toHaveLength(1);
    expect(decoded[0].userMsg.text).toBe("inspect file");
    expect(decoded[0].steps).toHaveLength(2);

    const toolCallStep = decoded[0].steps[0]!;
    expect(toolCallStep.message.case).toBe("toolCall");
    expect(toolCallStep.message.value.tool.case).toBe("mcpToolCall");
    expect(toolCallStep.message.value.tool.value.args?.toolCallId).toBe("tc1");
    expect(toolCallStep.message.value.tool.value.args?.toolName).toBe("read");
    expect(toolCallStep.message.value.tool.value.result?.result.case).toBe("success");
    expect(toolCallStep.message.value.tool.value.result?.result.value.content[0]?.content.case).toBe("text");
    expect(toolCallStep.message.value.tool.value.result?.result.value.content[0]?.content.value.text).toBe("file contents");

    const finalAssistantStep = decoded[0].steps[1]!;
    expect(finalAssistantStep.message.case).toBe("assistantMessage");
    expect((finalAssistantStep.message.value as any).text).toBe("I found the issue.");

    const userAction = req.action.action.value as any;
    expect(userAction.userMessage.text).toBe("fix it");
  });

  test("no checkpoint, turn with no steps — no reconstructed steps", () => {
    const turns = [turn("hello")];
    const payload = buildCursorRequest("gpt-5", "system", "follow up", turns, "conv-1", null);
    const req = decodeRunRequest(payload);
    const decoded = decodeTurns(req.conversationState, payload.blobStore);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].userMsg.text).toBe("hello");
    expect(decoded[0].steps).toHaveLength(0);
  });

  test("with checkpoint — uses checkpoint, ignores turns", () => {
    const priorPayload = buildCursorRequest("gpt-5", "system", "hello", [], "conv-1", null);
    const priorReq = decodeRunRequest(priorPayload);
    const checkpoint = toBinary(ConversationStateStructureSchema, priorReq.conversationState);

    const turns = [turn("SHOULD NOT APPEAR", [assistantStep("SHOULD NOT APPEAR")])];
    const payload = buildCursorRequest("gpt-5", "system", "next", turns, "conv-1", checkpoint);
    const req = decodeRunRequest(payload);

    expect(req.conversationState.turns).toHaveLength(0);
  });

  test("system prompt stored in blobStore", () => {
    const payload = buildCursorRequest("gpt-5", "You are helpful", "hi", [], "conv-1", null);
    const req = decodeRunRequest(payload);
    expect(req.conversationState.rootPromptMessagesJson).toHaveLength(1);
    const blobId = Buffer.from(req.conversationState.rootPromptMessagesJson[0]).toString("hex");
    expect(payload.blobStore.has(blobId)).toBe(true);
    const blobData = JSON.parse(new TextDecoder().decode(payload.blobStore.get(blobId)!));
    expect(blobData.role).toBe("system");
    expect(blobData.content).toBe("You are helpful");
  });

  test("each reconstructed turn has a unique messageId", () => {
    const turns = [
      turn("a", [assistantStep("b")]),
      turn("a", [assistantStep("b")]),
    ];
    const payload = buildCursorRequest("gpt-5", "system", "c", turns, "conv-1", null);
    const req = decodeRunRequest(payload);
    const decoded = decodeTurns(req.conversationState, payload.blobStore);
    expect(decoded[0].userMsg.messageId).not.toBe(decoded[1].userMsg.messageId);
  });
});

// ── Fork via checkpoint discard + reconstruction ──

describe("fork discards checkpoint, reconstruction takes over", () => {
  test("fork scenario — checkpoint discarded, turns reconstructed from messages", () => {
    const turns = [turn("first", [assistantStep("response1")])];
    const payload = buildCursorRequest("gpt-5", "system", "forked question", turns, "conv-1", null);
    const req = decodeRunRequest(payload);

    const decoded = decodeTurns(req.conversationState, payload.blobStore);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].userMsg.text).toBe("first");
    expect((decoded[0].steps[0].message.value as any).text).toBe("response1");

    const userAction = req.action.action.value as any;
    expect(userAction.userMessage.text).toBe("forked question");
    expect(userAction.userMessage.text).not.toContain("<conversation_history>");
  });

  test("fork to beginning — no turns, no reconstruction", () => {
    const payload = buildCursorRequest("gpt-5", "system", "start over", [], "conv-1", null);
    const req = decodeRunRequest(payload);
    expect(req.conversationState.turns).toHaveLength(0);
    const userAction = req.action.action.value as any;
    expect(userAction.userMessage.text).toBe("start over");
  });
});

// ── Tool-aware parsing ──

describe("parseMessages — structured tool turns", () => {
  test("preserves tool call, tool result, and final assistant text in a completed turn", () => {
    const parsed = parseMessages([
      { role: "system", content: "system" },
      { role: "user", content: "read file X" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "tc1", type: "function", function: { name: "read", arguments: '{"path":"X"}' } }],
      },
      { role: "tool", content: "file contents here", tool_call_id: "tc1" },
      { role: "assistant", content: "Here is file X..." },
      { role: "user", content: "now do Y" },
    ]);

    expect(parsed.userText).toBe("now do Y");
    expect(parsed.toolResults).toEqual([]);
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.turns[0]).toEqual(turn("read file X", [
      toolStep("tc1", "read", { path: "X" }, { content: "file contents here", isError: false }),
      assistantStep("Here is file X..."),
    ]));
  });

  test("tool result continuation does not inflate completed turn count", () => {
    const initialMsgs = [
      { role: "system" as const, content: "system" },
      { role: "user" as const, content: "read file X" },
    ];
    const initial = parseMessages(initialMsgs);
    expect(initial.turns).toHaveLength(0);
    expect(initial.userText).toBe("read file X");

    const toolResultMsgs = [
      { role: "system" as const, content: "system" },
      { role: "user" as const, content: "read file X" },
      { role: "assistant" as const, content: null, tool_calls: [{ id: "tc1", type: "function" as const, function: { name: "read", arguments: '{"path":"X"}' } }] },
      { role: "tool" as const, content: "file contents here", tool_call_id: "tc1" },
    ];
    const toolResult = parseMessages(toolResultMsgs);

    expect(toolResult.turns).toHaveLength(0);
    expect(toolResult.userText).toBe("read file X");
    expect(toolResult.toolResults).toEqual([{ toolCallId: "tc1", content: "file contents here" }]);

    const nextMsgs = [
      { role: "system" as const, content: "system" },
      { role: "user" as const, content: "read file X" },
      { role: "assistant" as const, content: "Here is file X..." },
      { role: "user" as const, content: "now do Y" },
    ];
    const next = parseMessages(nextMsgs);
    expect(next.turns.length).toBe(1);
  });

  test("multi-turn tool continuation keeps completed-history count stable", () => {
    const initialMsgs = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "u1" },
      { role: "assistant" as const, content: "a1" },
      { role: "user" as const, content: "u2" },
      { role: "assistant" as const, content: "a2" },
      { role: "user" as const, content: "u3" },
    ];
    const initial = parseMessages(initialMsgs);
    expect(initial.turns.length).toBe(2);

    const toolResultMsgs = [
      ...initialMsgs.slice(0, -1),
      { role: "user" as const, content: "u3" },
      { role: "assistant" as const, content: null, tool_calls: [{ id: "t1", type: "function" as const, function: { name: "bash", arguments: '{}' } }] },
      { role: "tool" as const, content: "output", tool_call_id: "t1" },
    ];
    const toolResult = parseMessages(toolResultMsgs);
    expect(toolResult.turns.length).toBe(2);
    expect(toolResult.toolResults).toEqual([{ toolCallId: "t1", content: "output" }]);

    const nextMsgs = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "u1" },
      { role: "assistant" as const, content: "a1" },
      { role: "user" as const, content: "u2" },
      { role: "assistant" as const, content: "a2" },
      { role: "user" as const, content: "u3" },
      { role: "assistant" as const, content: "a3 with tool results" },
      { role: "user" as const, content: "u4" },
    ];
    const next = parseMessages(nextMsgs);
    expect(next.turns.length).toBe(3);
  });

  test("mixed resolved and unresolved tool calls stay in the in-flight turn", () => {
    const parsed = parseMessages([
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "review it" },
      {
        role: "assistant" as const,
        content: "starting review",
        tool_calls: [{ id: "t1", type: "function" as const, function: { name: "read", arguments: '{"path":"package.json"}' } }],
      },
      { role: "tool" as const, content: "pkg", tool_call_id: "t1" },
      {
        role: "assistant" as const,
        content: "continuing review",
        tool_calls: [{ id: "t2", type: "function" as const, function: { name: "read", arguments: '{"path":"README.md"}' } }],
      },
    ]);

    expect(parsed.turns).toHaveLength(0);
    expect(parsed.userText).toBe("review it");
    expect(parsed.toolResults).toEqual([{ toolCallId: "t1", content: "pkg" }]);
  });
});

function frameConnectMessageForTest(data: Uint8Array, flags = 0): Buffer {
  const frame = Buffer.alloc(5 + data.length);
  frame[0] = flags;
  frame.writeUInt32BE(data.length, 1);
  frame.set(data, 5);
  return frame;
}

function decodeConnectFramesForTest(data: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let pending = Buffer.from(data);
  while (pending.length >= 5) {
    const length = pending.readUInt32BE(1);
    if (pending.length < 5 + length) break;
    frames.push(pending.subarray(5, 5 + length));
    pending = pending.subarray(5 + length);
  }
  return frames;
}

class FakeBridge {
  readonly proc = {
    kill: () => {
      this.close(143);
      return true;
    },
  };

  private aliveState = true;
  private dataCb: ((chunk: Buffer) => void) | null = null;
  private closeCb: ((code: number) => void) | null = null;
  private pendingCloseCode: number | null = null;
  private pendingServerChunks: Buffer[] = [];
  readonly clientMessages: any[] = [];

  constructor(
    readonly options: { accessToken: string; rpcPath: string; url?: string; unary?: boolean },
    private readonly onClientMessage?: (message: any, bridge: FakeBridge) => void,
  ) {}

  get alive() {
    return this.aliveState;
  }

  write(data: Uint8Array) {
    for (const frame of decodeConnectFramesForTest(data)) {
      const clientMessage = fromBinary(AgentClientMessageSchema, frame);
      this.clientMessages.push(clientMessage);
      this.onClientMessage?.(clientMessage, this);
    }
  }

  end() {
    this.close(0);
  }

  onData(cb: (chunk: Buffer) => void) {
    this.dataCb = cb;
    for (const chunk of this.pendingServerChunks.splice(0)) cb(chunk);
  }

  onClose(cb: (code: number) => void) {
    if (this.pendingCloseCode !== null) {
      const code = this.pendingCloseCode;
      queueMicrotask(() => cb(code));
      return;
    }
    this.closeCb = cb;
  }

  emitServerMessage(message: any) {
    const payload = toBinary(AgentServerMessageSchema, message);
    this.emitChunk(frameConnectMessageForTest(payload));
  }

  emitEndStream(payload: Record<string, unknown> = {}) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    this.emitChunk(frameConnectMessageForTest(bytes, 0b00000010));
  }

  close(code = 0) {
    if (!this.aliveState) return;
    this.aliveState = false;
    if (this.closeCb) {
      const cb = this.closeCb;
      queueMicrotask(() => cb(code));
    } else {
      this.pendingCloseCode = code;
    }
  }

  private emitChunk(chunk: Buffer) {
    if (this.dataCb) {
      this.dataCb(chunk);
    } else {
      this.pendingServerChunks.push(chunk);
    }
  }
}

function makeTextDeltaMessage(text: string) {
  return create(AgentServerMessageSchema, {
    message: {
      case: "interactionUpdate",
      value: create(InteractionUpdateSchema, {
        message: { case: "textDelta", value: create(TextDeltaUpdateSchema, { text }) },
      }),
    },
  });
}

function makeCheckpointMessage() {
  return create(AgentServerMessageSchema, {
    message: {
      case: "conversationCheckpointUpdate",
      value: create(ConversationStateStructureSchema, {}),
    },
  });
}

function makeSetBlobMessage(blobId: Uint8Array, blobData: Uint8Array) {
  return create(AgentServerMessageSchema, {
    message: {
      case: "kvServerMessage",
      value: create(KvServerMessageSchema, {
        id: 1,
        message: {
          case: "setBlobArgs",
          value: create(SetBlobArgsSchema, { blobId, blobData }),
        },
      }),
    },
  });
}

function makeMcpExecMessage(toolCallId: string, toolName: string, args: Record<string, string>) {
  return create(AgentServerMessageSchema, {
    message: {
      case: "execServerMessage",
      value: create(ExecServerMessageSchema, {
        id: 1,
        execId: "exec-1",
        message: {
          case: "mcpArgs",
          value: create(McpArgsSchema, {
            name: toolName,
            toolName,
            toolCallId,
            providerIdentifier: "pi",
            args: Object.fromEntries(
              Object.entries(args).map(([key, value]) => [key, new TextEncoder().encode(value)]),
            ),
          }),
        },
      }),
    },
  });
}

async function postChatCompletion(port: number, body: Record<string, unknown>) {
  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1",
      port,
      path: "/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

describe("proxy integration — session handling", () => {
  test("tool-call continuation reuses the live bridge and commits a checkpoint when the turn completes", async () => {
    const runRequests: any[] = [];
    const execClientMessages: any[] = [];
    const bridges: FakeBridge[] = [];

    setBridgeFactoryForTests((options) => {
      const bridge = new FakeBridge(options, (clientMessage, fake) => {
        if (clientMessage.message.case === "runRequest") {
          runRequests.push(clientMessage.message.value);
          fake.emitServerMessage(makeMcpExecMessage("tc1", "read", { path: "README.md" }));
          return;
        }

        if (clientMessage.message.case === "execClientMessage") {
          execClientMessages.push(clientMessage.message.value);
          setTimeout(() => {
            fake.emitServerMessage(makeTextDeltaMessage("I found the issue."));
            fake.emitServerMessage(makeCheckpointMessage());
            fake.close(0);
          }, 0);
        }
      });
      bridges.push(bridge);
      return bridge;
    });

    const sessionId = "session-tool";
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const port = await startProxy(async () => "test-token");

    const first = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [{ role: "user", content: "inspect file" }],
      tools: [{ type: "function", function: { name: "read" } }],
    });

    expect(first.statusCode).toBe(200);
    expect(first.body).toContain("\"finish_reason\":\"tool_calls\"");
    expect(first.body).toContain("\"id\":\"tc1\"");
    expect(bridges).toHaveLength(1);
    expect(runRequests).toHaveLength(1);
    expect(__testInternals.activeBridges.has(bridgeKey)).toBe(true);

    const second = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [
        { role: "user", content: "inspect file" },
        { role: "assistant", content: null, tool_calls: [{ id: "tc1", type: "function", function: { name: "read", arguments: '{"path":"README.md"}' } }] },
        { role: "tool", content: "README contents", tool_call_id: "tc1" },
      ],
    });

    expect(second.statusCode).toBe(200);
    expect(second.body).toContain("I found the issue.");
    expect(runRequests).toHaveLength(1);
    expect(execClientMessages).toHaveLength(1);
    expect(execClientMessages[0].execId).toBe("exec-1");
    expect(execClientMessages[0].message.case).toBe("mcpResult");
    expect(execClientMessages[0].message.value.result.case).toBe("success");
    expect(__testInternals.activeBridges.has(bridgeKey)).toBe(false);

    const stored = __testInternals.conversationStates.get(convKey);
    expect(stored?.checkpoint).toBeTruthy();

  });

  test("partial tool-result batches stay in-flight until all pending tool results arrive", async () => {
    const execClientMessages: any[] = [];
    const sessionId = "session-partial-tools";
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const convKey = deriveConversationKeyFromSessionId(sessionId);

    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-partial-tools",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });

    const bridge = new FakeBridge({ accessToken: "test-token", rpcPath: "/agent.v1.AgentService/Run" }, (clientMessage, fake) => {
      if (clientMessage.message.case === "execClientMessage") {
        execClientMessages.push(clientMessage.message.value);
        if (execClientMessages.length === 2) {
          setTimeout(() => {
            fake.emitServerMessage(makeTextDeltaMessage("final review"));
            fake.emitServerMessage(makeCheckpointMessage());
            fake.close(0);
          }, 0);
        }
      }
    });

    __testInternals.activeBridges.set(bridgeKey, {
      bridge: bridge as any,
      heartbeatTimer: setInterval(() => {}, 60_000),
      blobStore: new Map(),
      mcpTools: [],
      pendingExecs: [
        { execId: "exec-1", execMsgId: 1, toolCallId: "tc1", toolName: "read", decodedArgs: '{"path":"package.json"}' },
        { execId: "exec-2", execMsgId: 2, toolCallId: "tc2", toolName: "read", decodedArgs: '{"path":"README.md"}' },
      ],
      currentTurn: turn("review it", [
        assistantStep("starting review"),
        toolStep("tc1", "read", { path: "package.json" }),
        assistantStep("continuing review"),
        toolStep("tc2", "read", { path: "README.md" }),
      ]),
    });

    const port = await startProxy(async () => "test-token");

    const partial = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [
        { role: "user", content: "review it" },
        { role: "assistant", content: "starting review", tool_calls: [{ id: "tc1", type: "function", function: { name: "read", arguments: '{"path":"package.json"}' } }] },
        { role: "tool", content: "pkg", tool_call_id: "tc1" },
        { role: "assistant", content: "continuing review", tool_calls: [{ id: "tc2", type: "function", function: { name: "read", arguments: '{"path":"README.md"}' } }] },
      ],
    });

    expect(partial.statusCode).toBe(200);
    expect(partial.body).toContain('"finish_reason":"tool_calls"');
    expect(partial.body).toContain('"id":"tc2"');
    expect(partial.body).not.toContain('"id":"tc1"');
    expect(execClientMessages).toHaveLength(0);
    expect(__testInternals.activeBridges.has(bridgeKey)).toBe(true);
    const partialBridge = __testInternals.activeBridges.get(bridgeKey);
    const partialT1 = partialBridge?.currentTurn.steps.find((step) => step.kind === "toolCall" && step.toolCallId === "tc1");
    expect(partialT1 && partialT1.kind === "toolCall" ? partialT1.result?.content : undefined).toBe("pkg");

    const complete = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [
        { role: "user", content: "review it" },
        { role: "assistant", content: "starting review", tool_calls: [{ id: "tc1", type: "function", function: { name: "read", arguments: '{"path":"package.json"}' } }] },
        { role: "tool", content: "pkg", tool_call_id: "tc1" },
        { role: "assistant", content: "continuing review", tool_calls: [{ id: "tc2", type: "function", function: { name: "read", arguments: '{"path":"README.md"}' } }] },
        { role: "tool", content: "readme", tool_call_id: "tc2" },
      ],
    });

    expect(complete.statusCode).toBe(200);
    expect(complete.body).toContain("final review");
    expect(execClientMessages).toHaveLength(2);
    expect(execClientMessages.map((m) => m.execId)).toEqual(["exec-1", "exec-2"]);
    expect(execClientMessages.every((m) => m.message.case === "mcpResult" && m.message.value.result.case === "success")).toBe(true);
    expect(__testInternals.activeBridges.has(bridgeKey)).toBe(false);

    const stored = __testInternals.conversationStates.get(convKey);
    expect(stored?.checkpoint).toBeTruthy();

  });

  test("tool-call pause closes the SSE without cancelling the live bridge", async () => {
    let cancelCount = 0;
    const sessionId = "session-tool-pause-close";
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const currentTurn = turn("inspect file");

    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-tool-pause-close",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });

    const bridge = new FakeBridge({ accessToken: "test-token", rpcPath: "/agent.v1.AgentService/Run" }, (clientMessage, fake) => {
      if (clientMessage.message.case === "conversationAction") {
        expect(clientMessage.message.value.action.case).toBe("cancelAction");
        cancelCount += 1;
        fake.close(0);
      }
    });

    const req = new EventEmitter() as any;
    const res = new EventEmitter() as any;
    res.headersSent = false;
    res.writeHead = () => {
      res.headersSent = true;
      return res;
    };
    res.write = () => true;
    res.end = () => {
      res.headersSent = true;
      queueMicrotask(() => res.emit("close"));
      return res;
    };

    const heartbeatTimer = setInterval(() => {}, 60_000);
    writeSSEStreamForTests({
      bridge: bridge as any,
      heartbeatTimer,
      modelId: "gpt-5",
      bridgeKey,
      convKey,
      completedTurns: [],
      currentTurn,
      req,
      res,
    });

    bridge.emitServerMessage(makeMcpExecMessage("tc1", "read", { path: "README.md" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cancelCount).toBe(0);
    expect(__testInternals.activeBridges.has(bridgeKey)).toBe(true);
  });

  test("stream cancellation sends cancelAction and persists the latest checkpoint and blob store immediately", async () => {
    let cancelCount = 0;
    const sessionId = "session-cancel";
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const currentTurn = turn("interrupt me");
    const blobId = new Uint8Array([1, 2, 3, 4]);
    const blobKey = Buffer.from(blobId).toString("hex");
    const blobData = new TextEncoder().encode("blob payload");

    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-cancel",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });

    const bridge = new FakeBridge({ accessToken: "test-token", rpcPath: "/agent.v1.AgentService/Run" }, (clientMessage, fake) => {
      if (clientMessage.message.case === "conversationAction") {
        expect(clientMessage.message.value.action.case).toBe("cancelAction");
        cancelCount += 1;
        fake.close(0);
      }
    });

    const req = new EventEmitter() as any;
    const res = new EventEmitter() as any;
    res.headersSent = false;
    res.writeHead = () => {
      res.headersSent = true;
      return res;
    };
    res.write = () => {
      queueMicrotask(() => res.emit("close"));
      return true;
    };
    res.end = () => {
      res.headersSent = true;
      return res;
    };

    const heartbeatTimer = setInterval(() => {}, 60_000);
    writeSSEStreamForTests({
      bridge: bridge as any,
      heartbeatTimer,
      modelId: "gpt-5",
      bridgeKey,
      convKey,
      completedTurns: [],
      currentTurn,
      req,
      res,
    });

    bridge.emitServerMessage(makeTextDeltaMessage("partial output"));
    bridge.emitServerMessage(makeSetBlobMessage(blobId, blobData));
    bridge.emitServerMessage(makeCheckpointMessage());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stored = __testInternals.conversationStates.get(convKey);
    expect(cancelCount).toBe(1);
    expect(stored).toBeDefined();
    expect(stored?.checkpoint).toBeTruthy();

    expect(Array.from(stored?.blobStore.get(blobKey) ?? [])).toEqual(Array.from(blobData));
    expect(__testInternals.activeBridges.has(bridgeKey)).toBe(false);
  });

  test("interrupt after a checkpoint reuses the stored checkpoint on the next request", async () => {
    const sessionId = "session-interrupt-after-checkpoint";
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const currentTurn = turn("interrupt me");

    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-interrupt-after-checkpoint",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });

    const interruptedBridge = new FakeBridge({ accessToken: "test-token", rpcPath: "/agent.v1.AgentService/Run" }, (clientMessage, fake) => {
      if (clientMessage.message.case === "conversationAction") {
        fake.close(0);
      }
    });

    const req = new EventEmitter() as any;
    const res = new EventEmitter() as any;
    res.headersSent = false;
    res.writeHead = () => {
      res.headersSent = true;
      return res;
    };
    res.write = () => {
      queueMicrotask(() => res.emit("close"));
      return true;
    };
    res.end = () => {
      res.headersSent = true;
      return res;
    };

    writeSSEStreamForTests({
      bridge: interruptedBridge as any,
      heartbeatTimer: setInterval(() => {}, 60_000),
      modelId: "gpt-5",
      bridgeKey,
      convKey,
      completedTurns: [],
      currentTurn,
      req,
      res,
    });

    interruptedBridge.emitServerMessage(makeTextDeltaMessage("partial output"));
    interruptedBridge.emitServerMessage(makeCheckpointMessage());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const storedCheckpoint = __testInternals.conversationStates.get(convKey)?.checkpoint;
    expect(storedCheckpoint).toBeTruthy();

    const runRequests: any[] = [];
    setBridgeFactoryForTests((options) => new FakeBridge(options, (clientMessage, fake) => {
      if (clientMessage.message.case === "runRequest") {
        runRequests.push(clientMessage.message.value);
        fake.close(0);
      }
    }));

    const port = await startProxy(async () => "test-token");
    const response = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "interrupt me" },
        { role: "user", content: "continue" },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(runRequests).toHaveLength(1);
    expect(toBinary(ConversationStateStructureSchema, runRequests[0].conversationState)).toEqual(storedCheckpoint);
    expect(runRequests[0].conversationId).toBe("conv-interrupt-after-checkpoint");
  });

  test("interrupt after checkpoint reuses it even when pi includes partial assistant text in resumed history", async () => {
    const sessionId = "session-interrupt-partial-assistant";
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const currentTurn = turn("ask something");

    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-partial-assistant",
      checkpoint: null,


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });

    const interruptedBridge = new FakeBridge({ accessToken: "test-token", rpcPath: "/agent.v1.AgentService/Run" }, (clientMessage, fake) => {
      if (clientMessage.message.case === "conversationAction") {
        fake.close(0);
      }
    });

    const req = new EventEmitter() as any;
    const res = new EventEmitter() as any;
    res.headersSent = false;
    res.writeHead = () => { res.headersSent = true; return res; };
    res.write = () => { queueMicrotask(() => res.emit("close")); return true; };
    res.end = () => { res.headersSent = true; return res; };

    writeSSEStreamForTests({
      bridge: interruptedBridge as any,
      heartbeatTimer: setInterval(() => {}, 60_000),
      modelId: "gpt-5",
      bridgeKey,
      convKey,
      completedTurns: [],
      currentTurn,
      req,
      res,
    });

    interruptedBridge.emitServerMessage(makeTextDeltaMessage("partial response text"));
    interruptedBridge.emitServerMessage(makeCheckpointMessage());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const storedCheckpoint = __testInternals.conversationStates.get(convKey)?.checkpoint;
    expect(storedCheckpoint).toBeTruthy();

    const runRequests: any[] = [];
    setBridgeFactoryForTests((options) => new FakeBridge(options, (clientMessage, fake) => {
      if (clientMessage.message.case === "runRequest") {
        runRequests.push(clientMessage.message.value);
        fake.close(0);
      }
    }));

    // Pi includes the partial assistant text in the resumed message history
    const port = await startProxy(async () => "test-token");
    const response = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "ask something" },
        { role: "assistant", content: "partial response text" },
        { role: "user", content: "continue" },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(runRequests).toHaveLength(1);
    // Checkpoint should be REUSED despite the partial assistant text in the incoming history
    expect(toBinary(ConversationStateStructureSchema, runRequests[0].conversationState)).toEqual(storedCheckpoint);
    expect(runRequests[0].conversationId).toBe("conv-partial-assistant");
  });

  test("interrupt before any new checkpoint reuses the prior checkpoint (session continues)", async () => {
    const sessionId = "session-interrupt-before-checkpoint";
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const bridgeKey = deriveBridgeKeyFromSessionId(sessionId);
    const priorTurns = [turn("earlier", [assistantStep("done")])];
    const priorPayload = buildCursorRequest("gpt-5", "system", "next", priorTurns, "conv-old", null);
    const priorCheckpoint = toBinary(ConversationStateStructureSchema, decodeRunRequest(priorPayload).conversationState);

    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-old",
      checkpoint: priorCheckpoint,
      sessionScoped: true,
      blobStore: new Map(priorPayload.blobStore),
      lastAccessMs: Date.now(),
    });

    const interruptedBridge = new FakeBridge({ accessToken: "test-token", rpcPath: "/agent.v1.AgentService/Run" }, (clientMessage, fake) => {
      if (clientMessage.message.case === "conversationAction") {
        fake.close(0);
      }
    });

    const req = new EventEmitter() as any;
    const res = new EventEmitter() as any;
    res.headersSent = false;
    res.writeHead = () => { res.headersSent = true; return res; };
    res.write = () => { queueMicrotask(() => res.emit("close")); return true; };
    res.end = () => { res.headersSent = true; return res; };

    writeSSEStreamForTests({
      bridge: interruptedBridge as any,
      heartbeatTimer: setInterval(() => {}, 60_000),
      modelId: "gpt-5",
      bridgeKey,
      convKey,
      completedTurns: priorTurns,
      currentTurn: turn("interrupt me"),
      req,
      res,
    });

    interruptedBridge.emitServerMessage(makeTextDeltaMessage("partial output"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Prior checkpoint survives — no discard logic
    expect(__testInternals.conversationStates.get(convKey)?.checkpoint).toEqual(priorCheckpoint);

    const runRequests: any[] = [];
    setBridgeFactoryForTests((options) => new FakeBridge(options, (clientMessage, fake) => {
      if (clientMessage.message.case === "runRequest") {
        runRequests.push(clientMessage.message.value);
        fake.close(0);
      }
    }));

    const port = await startProxy(async () => "test-token");
    const response = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "earlier" },
        { role: "assistant", content: "done" },
        { role: "user", content: "interrupt me" },
        { role: "user", content: "continue" },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(runRequests).toHaveLength(1);
    expect(runRequests[0].conversationId).toBe("conv-old");
    // Prior checkpoint reused — session continues on Cursor side
    expect(toBinary(ConversationStateStructureSchema, runRequests[0].conversationState)).toEqual(priorCheckpoint);
    expect(runRequests[0].action.action.value.userMessage.text).toBe("continue");
  });

  test("same-depth branch with different assistant text reuses checkpoint (pi lifecycle hooks handle real forks)", async () => {
    // When only assistant steps differ on the last turn, the checkpoint is kept.
    // Actual branch navigation in pi fires session_before_tree/session_before_fork
    // which cleans up state before the next request arrives.
    const runRequests: any[] = [];

    setBridgeFactoryForTests((options) => new FakeBridge(options, (clientMessage, fake) => {
      if (clientMessage.message.case === "runRequest") {
        runRequests.push(clientMessage.message.value);
        fake.close(0);
      }
    }));

    const sessionId = "session-branch";
    const convKey = deriveConversationKeyFromSessionId(sessionId);
    const storedTurns = [turn("first", [assistantStep("branch-a")])];
    const priorPayload = buildCursorRequest("gpt-5", "system", "next", storedTurns, "conv-branch", null);
    const priorRequest = decodeRunRequest(priorPayload);
    __testInternals.conversationStates.set(convKey, {
      conversationId: "conv-branch",
      checkpoint: toBinary(ConversationStateStructureSchema, priorRequest.conversationState),


      sessionScoped: true,
      blobStore: new Map(),
      lastAccessMs: Date.now(),
    });

    const storedCheckpoint = __testInternals.conversationStates.get(convKey)?.checkpoint;

    const port = await startProxy(async () => "test-token");
    const response = await postChatCompletion(port, {
      model: "gpt-5",
      pi_session_id: sessionId,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "first" },
        { role: "assistant", content: "branch-b" },
        { role: "user", content: "next" },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(runRequests).toHaveLength(1);
    // Checkpoint reused — conversationState comes from the stored checkpoint
    expect(toBinary(ConversationStateStructureSchema, runRequests[0].conversationState)).toEqual(storedCheckpoint);
  });

});

