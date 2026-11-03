export type ClipboardMirrorPolicy = "all" | "yank" | "never";
export type RegisterWriteSource = "mutation" | "yank";
export const DEFAULT_CLIPBOARD_MIRROR_POLICY: ClipboardMirrorPolicy = "all";

function fmt(v: unknown) {
  const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  try {
    return `${JSON.stringify(v) ?? type} (type ${type})`;
  } catch {
    return `(type ${type})`;
  }
}

export function resolveClipboardMirrorPolicy(value: unknown) {
  if (value === undefined) return { policy: DEFAULT_CLIPBOARD_MIRROR_POLICY };
  const p = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (p === "all" || p === "yank" || p === "never")
    return { policy: p as ClipboardMirrorPolicy };
  return {
    policy: DEFAULT_CLIPBOARD_MIRROR_POLICY,
    warning: `Invalid piVim.clipboardMirror ${fmt(value)}; expected all, yank, never.`,
  };
}
