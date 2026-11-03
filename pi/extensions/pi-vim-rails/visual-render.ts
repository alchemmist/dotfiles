import { visibleWidth } from "@earendil-works/pi-tui";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
// Preserve zero-width terminal controls atomically, especially Pi's APC cursor
// markers. Inserting SGR inside any of these corrupts the TUI cursor protocol.
const control = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|_[^\x07\x1b]*(?:\x07|\x1b\\))/g;

export function applySelectionBackground(line: string, start: number, end: number): string {
  if (end <= start) return line;
  let column = 0;
  let offset = 0;
  let output = "";
  const paint = (text: string) => {
    for (const { segment } of graphemes.segment(text)) {
      const width = visibleWidth(segment);
      const selected = width > 0 && column < end && column + width > start;
      // ANSI bright-black background follows the terminal’s active 16-color
      // palette (Alacritty colors.bright.black), not a fixed RGB/256-color gray.
      output += selected ? `\x1b[100m${segment}\x1b[49m` : segment;
      column += width;
    }
  };
  // A fresh regexp avoids shared lastIndex state between renders.
  for (const match of line.matchAll(new RegExp(control.source, "g"))) {
    paint(line.slice(offset, match.index));
    output += match[0];
    offset = match.index + match[0].length;
  }
  paint(line.slice(offset));
  return output;
}
