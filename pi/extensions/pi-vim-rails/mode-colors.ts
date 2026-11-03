import type { ModeColorSettings } from "./settings.js";

const MODE_COLORS = {
  insert: "borderMuted",
  normal: "borderAccent",
  visual: "customMessageLabel",
  ex: "warning",
} as const;
const TOKEN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export type ModeColorKey = keyof typeof MODE_COLORS;
export type ModeColorizers = Record<ModeColorKey, (s: string) => string>;
export type ThemeLike = { fg(token: string, text: string): string };

export function resolveModeColors(
  colors?: ModeColorSettings,
): Required<ModeColorSettings> {
  return {
    insert: colors?.insert ?? MODE_COLORS.insert,
    normal: colors?.normal ?? MODE_COLORS.normal,
    visual: colors?.visual ?? MODE_COLORS.visual,
    ex: colors?.ex ?? MODE_COLORS.ex,
  };
}

function colorizeWithTheme(
  theme: ThemeLike,
  token: string,
  fallback: string,
  text: string,
): string {
  const trimmedToken = token.trim();
  if (TOKEN.test(trimmedToken)) {
    try {
      return theme.fg(trimmedToken, text);
    } catch {
      return theme.fg(fallback, text);
    }
  }
  return theme.fg(fallback, text);
}

export function buildModeColorizers(
  theme: ThemeLike,
  colors: Required<ModeColorSettings>,
  transform: (text: string) => string = (text) => text,
): ModeColorizers {
  const colorizer = (mode: ModeColorKey) => (text: string) =>
    colorizeWithTheme(theme, colors[mode], MODE_COLORS[mode], transform(text));
  return {
    insert: colorizer("insert"),
    normal: colorizer("normal"),
    visual: colorizer("visual"),
    ex: colorizer("ex"),
  };
}

// Sentinel string passed through two border colorizers to compare the color
// they emit without caring about the text they wrap.
const BORDER_COLOR_PROBE = "|";

// Builds a colorizer that renders Pi's neutral "thinking off" border color.
// Used as the reference for the resting/default border so pi-vim can recolor
// only that state and defer to any active thinking level or foreign highlight.
export function buildOffBorderColor(theme: ThemeLike): (s: string) => string {
  return (s: string) => {
    try {
      return theme.fg("thinkingOff", s);
    } catch {
      // Unknown token (e.g. a stripped-down theme): fall back to the raw text
      // so the equality probe simply won't match a real colored border.
      return s;
    }
  };
}

// Returns true when the host's current border color (`base`) is the neutral
// resting default, meaning pi-vim may safely apply its own mode color. When
// `offBorderColor` is unavailable, detection is disabled and this returns true
// (legacy behavior: always apply the mode color). A probe that throws is
// treated as "not neutral" so we defer rather than risk clobbering an unknown
// highlight.
export function isNeutralBorder(
  base: unknown,
  offBorderColor: ((s: string) => string) | null | undefined,
): boolean {
  if (typeof offBorderColor !== "function") return true;
  if (typeof base !== "function") return true;
  try {
    return (
      (base as (s: string) => string)(BORDER_COLOR_PROBE) ===
      offBorderColor(BORDER_COLOR_PROBE)
    );
  } catch {
    return false;
  }
}
