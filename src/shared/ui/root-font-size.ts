/**
 * Resolves lengths the reader's font setting can move. The type ramp is in `rem`
 * (`app/globals.css`), so `Number.parseFloat` on a token would return 0.6875 for 11px; lengths
 * must be resolved against the root the page is using.
 */

/** 16 unless the reader changed it. */
export const DEFAULT_ROOT_FONT_PX = 16;

/** Read at every call: a font-size preference can change without a resize event. */
export function rootFontPx(): number {
  if (typeof document === "undefined") return DEFAULT_ROOT_FONT_PX;
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROOT_FONT_PX;
}

/**
 * Handles `px` and `rem` only. `em` depends on the parent, which this cannot see, so it
 * returns `NaN` and fails at its consumer; a unitless number is read as pixels.
 */
export function cssLengthToPx(value: string, root: number = rootFontPx()): number {
  const trimmed = value.trim();
  const magnitude = Number.parseFloat(trimmed);
  if (!Number.isFinite(magnitude)) return Number.NaN;
  if (/rem\s*$/.test(trimmed)) return magnitude * root;
  if (/em\s*$/.test(trimmed)) return Number.NaN;
  return magnitude;
}
