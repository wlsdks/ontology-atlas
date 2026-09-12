/**
 * **Resolving a length that the reader's font setting can move.**
 *
 * Since 2026-09-12 the type ramp is declared in `rem` so a browser's text-only zoom reaches it
 * (`app/globals.css`, "The ramp is written in `rem`"). That makes `getPropertyValue('--text-label')`
 * return `"0.6875rem"` where it used to return `"11px"`, and `Number.parseFloat` on that string
 * returns **0.6875** — a number that is finite, positive, and off by a factor of sixteen. Nothing
 * throws; a canvas simply draws its names at two thirds of a pixel.
 *
 * That is the whole reason this file exists: a token's *value* is now a length in a unit, and the
 * only honest way to turn one into pixels outside the style engine is to resolve it against the
 * root the page is actually using.
 */

/** The root font size the document is rendering at — 16 unless the reader changed it. */
export const DEFAULT_ROOT_FONT_PX = 16;

/**
 * The root font size right now, in pixels.
 *
 * Read fresh at every call rather than cached: the value a reader is asking about is the one in
 * effect at the moment they look, and a browser font-size preference can change between frames
 * without any resize event firing.
 */
export function rootFontPx(): number {
  if (typeof document === "undefined") return DEFAULT_ROOT_FONT_PX;
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROOT_FONT_PX;
}

/**
 * A CSS length string in pixels, resolved against a root size.
 *
 * `px` and `rem` only, and that is deliberate. `em` resolves against the *parent's* size, which
 * this function cannot see and a caller outside the style engine almost never means; returning
 * `NaN` makes such a token fail loudly at its own consumer rather than draw at the wrong scale.
 * A unitless number is read as pixels, because that is what every historical caller meant.
 */
export function cssLengthToPx(value: string, root: number = rootFontPx()): number {
  const trimmed = value.trim();
  const magnitude = Number.parseFloat(trimmed);
  if (!Number.isFinite(magnitude)) return Number.NaN;
  if (/rem\s*$/.test(trimmed)) return magnitude * root;
  if (/em\s*$/.test(trimmed)) return Number.NaN;
  return magnitude;
}
