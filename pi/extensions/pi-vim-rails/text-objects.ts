import { getLineGraphemes } from "./motions.js";

export type TextObjectKind = "i" | "a";

export type TextObjectRange = {
  startAbs: number;
  endAbs: number;
};

export type WordTextObjectClass = "word" | "WORD";

export type DelimiterSpec = {
  type: "quote" | "bracket";
  open: string;
  close: string;
};

export type MatchingPairKind = "()" | "[]" | "{}";

export type MatchingPairMotionTarget = {
  pair: MatchingPairKind;
  sourceAbs: number;
  targetAbs: number;
  rangeAnchorAbs: number;
};

function normalizeCount(count: number): number {
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.floor(count);
}

function clampCursorCol(line: string, cursorCol: number): number {
  if (line.length === 0) return 0;
  if (!Number.isFinite(cursorCol)) return 0;

  const normalized = Math.trunc(cursorCol);
  return Math.max(0, Math.min(normalized, line.length - 1));
}

function clampCursorAbs(text: string, cursorAbs: number): number {
  if (text.length === 0) return 0;
  if (!Number.isFinite(cursorAbs)) return 0;

  const normalized = Math.trunc(cursorAbs);
  return Math.max(0, Math.min(normalized, text.length - 1));
}

function findLogicalLineBounds(
  line: string,
  cursorCol: number,
): { start: number; end: number } {
  if (line.length === 0) return { start: 0, end: 0 };

  const previousSearchStart =
    line[cursorCol] === "\n" ? cursorCol - 1 : cursorCol;
  const start = line.lastIndexOf("\n", previousSearchStart) + 1;
  const nextNewline = line.indexOf("\n", cursorCol);

  return { start, end: nextNewline === -1 ? line.length : nextNewline };
}

/**
 * Vim character classes for word text objects: 0 = blank, 1 = other
 * (non-blank punctuation/symbol), 2 = word (keyword). `iW`/`aW` collapse
 * every non-blank character into the single word class. Matches nvim's
 * `cls()` split, which is what `iw`/`aw` scan over.
 */
type WordCharClass = 0 | 1 | 2;

// Unicode-aware keyword test: letters, numbers, combining marks (so grapheme
// clusters such as a base letter plus combining accent stay in one word), and
// underscore. Mirrors nvim treating accented Latin and CJK as word characters,
// unlike the ASCII-only `\w`.
const WORD_CHAR_PATTERN = /[\p{L}\p{N}\p{M}_]/u;

function isWordChar(ch: string): boolean {
  return WORD_CHAR_PATTERN.test(ch);
}

function pairKind(ch?: string): MatchingPairKind | null {
  return ch === "(" || ch === ")"
    ? "()"
    : ch === "[" || ch === "]"
      ? "[]"
      : ch === "{" || ch === "}"
        ? "{}"
        : null;
}

function scanSameDelimiterPairs(
  text: string,
  open: string,
  close: string,
  onPair: (openAbs: number, closeAbs: number) => number | null,
): number | null {
  const stack: number[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === open) stack.push(index);
    else if (text[index] === close) {
      const openAbs = stack.pop();
      if (openAbs === undefined) continue;
      const targetAbs = onPair(openAbs, index);
      if (targetAbs !== null) return targetAbs;
    }
  }
  return null;
}

export function normalizeDelimiterKey(key: string): DelimiterSpec | null {
  if (key === '"' || key === "'" || key === "`")
    return { type: "quote", open: key, close: key };
  const pair =
    key === "(" || key === ")" || key === "b"
      ? "()"
      : key === "[" || key === "]"
        ? "[]"
        : key === "{" || key === "}" || key === "B"
          ? "{}"
          : null;
  return pair ? { type: "bracket", open: pair[0], close: pair[1] } : null;
}

export function isEscapedDelimiter(text: string, index: number): boolean {
  if (!Number.isInteger(index) || index <= 0 || index >= text.length)
    return false;

  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    backslashCount++;
  }

  return backslashCount % 2 === 1;
}

export function resolveQuoteObjectRange(
  text: string,
  cursorAbs: number,
  kind: TextObjectKind,
  quote: string,
): TextObjectRange | null {
  const spec = normalizeDelimiterKey(quote);
  if (spec?.type !== "quote") return null;

  const cursor = clampCursorAbs(text, cursorAbs);
  const bounds = findLogicalLineBounds(text, cursor);
  if (bounds.start >= bounds.end) return null;

  let openIndex: number | null = null;
  let bestPair: { open: number; close: number } | null = null;

  for (let index = bounds.start; index < bounds.end; index++) {
    if (text[index] !== quote || isEscapedDelimiter(text, index)) continue;

    if (openIndex === null) {
      openIndex = index;
      continue;
    }

    if (openIndex <= cursor && cursor <= index) {
      if (
        bestPair === null ||
        index - openIndex < bestPair.close - bestPair.open
      ) {
        bestPair = { open: openIndex, close: index };
      }
    }
    openIndex = null;
  }

  if (bestPair === null) return null;

  if (kind === "i") {
    return {
      startAbs: bestPair.open + 1,
      endAbs: bestPair.close,
    };
  }

  return {
    startAbs: bestPair.open,
    endAbs: bestPair.close + 1,
  };
}

export function resolveBracketObjectRange(
  text: string,
  cursorAbs: number,
  kind: TextObjectKind,
  open: string,
  close: string,
): TextObjectRange | null {
  if (open.length !== 1 || close.length !== 1 || open === close) return null;

  const cursor = clampCursorAbs(text, cursorAbs);
  let bestPair = null as { open: number; close: number } | null;

  scanSameDelimiterPairs(text, open, close, (openIndex, closeIndex) => {
    if (openIndex <= cursor && cursor <= closeIndex) {
      if (
        bestPair === null ||
        closeIndex - openIndex < bestPair.close - bestPair.open
      ) {
        bestPair = { open: openIndex, close: closeIndex };
      }
    }
    return null;
  });

  if (bestPair === null) return null;

  if (kind === "i") {
    return {
      startAbs: bestPair.open + 1,
      endAbs: bestPair.close,
    };
  }

  return {
    startAbs: bestPair.open,
    endAbs: bestPair.close + 1,
  };
}

export function resolveMatchingPairMotionTarget(
  text: string,
  cursorAbs: number,
  currentLineStartAbs: number,
  currentLineEndAbs: number,
): MatchingPairMotionTarget | null {
  const start = currentLineStartAbs,
    end = currentLineEndAbs;
  if (!text.length || start >= end) return null;
  const visibleEol = cursorAbs >= end;
  let sourceAbs = visibleEol ? end - 1 : Math.max(cursorAbs, start);
  const rangeAnchorAbs = visibleEol ? sourceAbs : cursorAbs;
  let pair = pairKind(text[sourceAbs]);
  for (
    let index = sourceAbs + 1;
    !visibleEol && !pair && index < end;
    index++
  ) {
    pair = pairKind(text[index]);
    if (pair) sourceAbs = index;
  }
  if (!pair) return null;
  const targetAbs = scanSameDelimiterPairs(
    text,
    pair[0],
    pair[1],
    (openAbs, closeAbs) =>
      openAbs === sourceAbs
        ? closeAbs
        : closeAbs === sourceAbs
          ? openAbs
          : null,
  );
  if (targetAbs !== null) return { pair, sourceAbs, targetAbs, rangeAnchorAbs };

  return null;
}

export function resolveDelimitedTextObjectRange(
  text: string,
  cursorAbs: number,
  kind: TextObjectKind,
  key: string,
): TextObjectRange | null {
  const spec = normalizeDelimiterKey(key);
  if (spec === null) return null;

  if (spec.type === "quote") {
    return resolveQuoteObjectRange(text, cursorAbs, kind, spec.open);
  }

  if (spec.type === "bracket") {
    return resolveBracketObjectRange(
      text,
      cursorAbs,
      kind,
      spec.open,
      spec.close,
    );
  }

  return null;
}

export function resolveWordTextObjectRange(
  line: string,
  lineStartAbs: number,
  cursorCol: number,
  kind: TextObjectKind,
  count: number = 1,
  semanticClass: WordTextObjectClass = "word",
): TextObjectRange | null {
  if (line.length === 0) return null;

  const cursor = clampCursorCol(line, cursorCol);
  const bounds = findLogicalLineBounds(line, cursor);
  if (bounds.start >= bounds.end) return null;

  // Classify by grapheme (keyed on the grapheme's first code point), not by a
  // single UTF-16 code unit. Indexing `line[idx]` splits astral letters — a
  // lone surrogate half fails the `\p{L}` keyword test and scores as
  // punctuation (`a𐐀b` becomes three runs) — and detaches a base character
  // from its trailing combining marks, so an emoji plus variation selector
  // (`☕️`) breaks into a symbol run and a mark run. nvim keeps each grapheme in
  // one class run; classifying the grapheme's leading code point and stamping
  // that class across the grapheme's UTF-16 offsets reproduces that while the
  // returned ranges stay in UTF-16 offsets.
  const classByOffset = new Int8Array(line.length).fill(-1);
  for (const { start: gStart, end: gEnd } of getLineGraphemes(line)) {
    const codePoint = line.codePointAt(gStart);
    const ch = codePoint === undefined ? "" : String.fromCodePoint(codePoint);
    // A newline (only ever its own grapheme) stays a -1 boundary sentinel.
    if (ch === "" || ch === "\n") continue;
    const cls: WordCharClass = /\s/.test(ch)
      ? 0
      : semanticClass === "WORD"
        ? 2
        : isWordChar(ch)
          ? 2
          : 1;
    classByOffset.fill(cls, gStart, gEnd);
  }

  // Class of the grapheme covering idx within the current logical line, or null
  // when idx falls outside the line or lands on a newline (a boundary).
  const classAt = (idx: number): WordCharClass | null => {
    if (idx < bounds.start || idx >= bounds.end) return null;
    const cls = classByOffset[idx];
    return cls === undefined || cls < 0 ? null : (cls as WordCharClass);
  };

  // Extend `end` over the maximal run of the class starting at `end`.
  const extendRun = (end: number): number => {
    const runClass = classAt(end);
    if (runClass === null) return end;
    let next = end;
    while (next < bounds.end && classAt(next) === runClass) next++;
    return next;
  };

  const totalCount = normalizeCount(count);
  const cursorCol0 = Math.max(bounds.start, Math.min(cursor, bounds.end - 1));
  const cursorClass = classAt(cursorCol0);
  if (cursorClass === null) return null;

  // The run under the cursor, whatever its class (word, punctuation, or the
  // whitespace run itself — nvim's `iw`/`aw` select whichever the cursor is on).
  let start = cursorCol0;
  while (start > bounds.start && classAt(start - 1) === cursorClass) start--;
  let end = cursorCol0 + 1;
  while (end < bounds.end && classAt(end) === cursorClass) end++;

  if (kind === "i") {
    // `count` consecutive runs (whitespace runs are counted too), forward.
    let remaining = totalCount - 1;
    while (remaining > 0 && end < bounds.end) {
      end = extendRun(end);
      remaining--;
    }
    // A count that runs out of line before it is satisfied is a no-op in nvim,
    // not a partial delete (`2diw` on the sole word `foo` preserves the
    // register); cancel by returning null.
    if (remaining > 0) return null;
    return { startAbs: lineStartAbs + start, endAbs: lineStartAbs + end };
  }

  // kind === "a"
  if (cursorClass === 0) {
    // On whitespace: the run plus the following word(s); if there is no
    // following word at all, there is nothing to select (nvim beeps / no-ops).
    if (end >= bounds.end) return null;
    let words = totalCount;
    while (words > 0 && end < bounds.end) {
      while (end < bounds.end && classAt(end) === 0) end++;
      if (end >= bounds.end) break;
      end = extendRun(end);
      words--;
    }
    // Not enough following words to satisfy the count: no-op (nvim preserves
    // the register) rather than deleting a partial span.
    if (words > 0) return null;
    return { startAbs: lineStartAbs + start, endAbs: lineStartAbs + end };
  }

  // On a word/punctuation run: `count` non-blank words with the whitespace
  // between them, then trailing whitespace; if none, leading whitespace.
  let words = totalCount - 1;
  while (words > 0 && end < bounds.end) {
    while (end < bounds.end && classAt(end) === 0) end++;
    if (end >= bounds.end) break;
    end = extendRun(end);
    words--;
  }
  // The count reached past the last word: no-op (nvim preserves the register,
  // e.g. `2daw` on the final word) instead of deleting whatever was collected.
  if (words > 0) return null;

  if (classAt(end) === 0) {
    end = extendRun(end); // trailing whitespace
  } else {
    while (start > bounds.start && classAt(start - 1) === 0) start--;
  }

  return { startAbs: lineStartAbs + start, endAbs: lineStartAbs + end };
}
