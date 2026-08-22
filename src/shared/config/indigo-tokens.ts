/**
 * The JS-side source of truth for indigo, for the places CSS variables
 * (`--color-indigo-*`) cannot reach: the canvas renderer and OpenGraph images.
 *
 * Tailwind arbitrary values (`bg-[color:rgba(94,106,210,0.x)]`) do **not** import
 * this module — those are matched as strings at build time and cannot reference a
 * runtime const. They stay consistent as long as they use the same RGB triplet
 * (`94,106,210` = `#5e6ad2`).
 *
 * All six variants are verified at chroma ≤ 8% in LCH. They are named by
 * **purpose**, not by lightness order:
 *   brand     — the canonical accent
 *   accent    — emphasised text, strong buttons
 *   hover     — hover state (more vivid)
 *   hub       — hub node fill (slightly lighter than brand)
 *   focus     — one-hop hub tone while focused
 *   highlight — selected node / context highlight (lightest)
 */

export const INDIGO_BRAND = "#5e6ad2";
export const INDIGO_ACCENT = "#7170ff";
export const INDIGO_HOVER = "#828fff";
export const INDIGO_HUB = "#6c77d4";
export const INDIGO_FOCUS = "#7c87e6";
export const INDIGO_HIGHLIGHT = "#8b97ff";

/** Exported for inline composition; prefer the `indigoRgba` helper below. */
export const INDIGO_RGB = {
  brand: "94, 106, 210",
  accent: "113, 112, 255",
  hover: "130, 143, 255",
  hub: "108, 119, 212",
  focus: "124, 135, 230",
  highlight: "139, 151, 255",
} as const;

export type IndigoVariant = keyof typeof INDIGO_RGB;

/**
 * For SVG fills and canvas paints that need an alpha.
 *
 * @example
 *   indigoRgba("highlight", 0.95) // "rgba(139, 151, 255, 0.95)"
 */
export function indigoRgba(variant: IndigoVariant, alpha: number): string {
  return `rgba(${INDIGO_RGB[variant]}, ${alpha})`;
}
