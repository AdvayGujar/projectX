import { Platform } from "react-native";

/**
 * Placeholder tokens. Colour and type family are not decided yet (docs/UI_SPEC.md §11).
 * Every value here is a stand-in so layout can be judged in the real stack, not a design
 * decision. The prototype used the same values.
 */
export const colors = {
  canvas: "#191614",
  raised: "#26211d",
  bubble: "#2b2621",
  composer: "#262220",
  border: "#35302a",
  divider: "#2b2621",
  control: "#332d28",
  text: "#efe9df",
  textMuted: "#a99f92",
  textFaint: "#8d8378",
  textDisabled: "#6b635a",
  danger: "#f87171",
  scrim: "rgba(0, 0, 0, 0.55)",
  monograms: ["#4f7cff", "#6b5bd2", "#3aa675"] as const,
} as const;

export const radius = {
  pill: 999,
  sheet: 18,
  bubble: 16,
  card: 10,
  composer: 24,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const typography = {
  body: 14,
  bodyLineHeight: 22,
  small: 11,
  caption: 10,
  label: 12,
  title: 24,
  headline: 24,
} as const;

export const monoFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
