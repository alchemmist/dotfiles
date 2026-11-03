/**
 * Visual-mode selection geometry.
 *
 * A visual selection is an anchor (where `v`/`V` was pressed) plus the live
 * cursor. Both ends are inclusive, so the grapheme under the later end belongs
 * to the selection. Character-wise selections span an absolute text range;
 * line-wise selections span whole lines and ignore the columns.
 */

import { getLineGraphemes } from "./motions.js";
import type { Mode } from "./types.js";

export type VisualMode = "visual" | "visual-line";
export type VisualPosition = { line: number; col: number };

export function isVisualMode(mode: Mode): mode is VisualMode {
  return mode === "visual" || mode === "visual-line";
}

/** Negative when `a` precedes `b` in buffer order, positive when it follows. */
export function compareVisualPositions(
  a: VisualPosition,
  b: VisualPosition,
): number {
  return a.line !== b.line ? a.line - b.line : a.col - b.col;
}

/** The two endpoints in buffer order, regardless of which one is the anchor. */
export function orderVisualEndpoints(
  anchor: VisualPosition,
  cursor: VisualPosition,
): { start: VisualPosition; end: VisualPosition } {
  return compareVisualPositions(anchor, cursor) <= 0
    ? { start: anchor, end: cursor }
    : { start: cursor, end: anchor };
}

/** Whole lines covered by a line-wise selection. */
export function getVisualLineRange(
  anchor: VisualPosition,
  cursor: VisualPosition,
): { startLine: number; endLine: number } {
  return {
    startLine: Math.min(anchor.line, cursor.line),
    endLine: Math.max(anchor.line, cursor.line),
  };
}

/**
 * Exclusive end column for an inclusive selection end sitting at `col`.
 * Grapheme-aware, so a selection ending on an emoji takes the whole cluster.
 * A column at or past the end of the line yields the line length.
 */
export function getInclusiveEndColumn(line: string, col: number): number {
  if (col >= line.length) return line.length;
  const segment = getLineGraphemes(line).find((s) => col < s.end);
  return segment ? segment.end : line.length;
}

/** Keep a stale anchor inside the buffer after the text changed underneath it. */
export function clampVisualPosition(
  position: VisualPosition,
  lines: string[],
): VisualPosition {
  const line = Math.max(0, Math.min(position.line, lines.length - 1));
  const col = Math.max(0, Math.min(position.col, (lines[line] ?? "").length));
  return { line, col };
}
