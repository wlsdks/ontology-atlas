import { LABEL_OFFSET } from "../../../render/labels";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";

/** Fixed-chrome safe insets (px): left ReaderLens panel, right popover rail, top utility lane, bottom hint. Optional so pure camera-math tests behave as a zero-inset fit. */
export type SafeInsetTokens = Partial<
  Pick<OntologyMapTokens, "safeInsetLeft" | "safeInsetRight" | "safeInsetTop" | "safeInsetBottom">
> & {
  /**
   * What a panel measured on screen actually covers, in canvas pixels: the real occlusion within the side inset.
   * `MAX_FIT_CHROME_SHARE` never shrinks the fit below it, so narrowing the reservation cannot slide the graph under
   * an open panel. Absent means "not measured": the whole inset is then a preference.
   */
  obstacleInsetLeft?: number;
  obstacleInsetRight?: number;
};

/**
 * The share of an axis the fit may reserve for chrome. Side insets are absolute pixels, so a
 * half-canvas ceiling leaves every desktop width from 1040 up untouched and binds only where
 * chrome would take more of the frame than the map.
 */
export const MAX_FIT_CHROME_SHARE = 0.5;

/**
 * How the two insets of one axis give way past the ceiling. `equal`: side lanes cut by the same
 * pixels, keeping the drawing centred.
 * `proportional`: top and bottom bands, which have no shared air to centre.
 */
export type FitInsetShare = "equal" | "proportional";

/**
 * Shrinks a pair of insets so together they reserve at most
 * `MAX_FIT_CHROME_SHARE` of `extent`, keeping each one's measured floor. Only
 * the part above the floor gives way, as `share` says; a side that reaches its
 * floor hands the rest of the cut to the other.
 */
export function clampFitInsets(
  lo: number,
  hi: number,
  extent: number,
  floorLo = 0,
  floorHi = 0,
  share: FitInsetShare = "proportional",
): { lo: number; hi: number } {
  if (!(extent > 0)) return { lo, hi };
  const budget = extent * MAX_FIT_CHROME_SHARE;
  if (lo + hi <= budget) return { lo, hi };
  const fLo = Math.min(Math.max(0, floorLo), lo);
  const fHi = Math.min(Math.max(0, floorHi), hi);
  const softLo = lo - fLo;
  const softHi = hi - fHi;
  const soft = softLo + softHi;
  if (soft <= 0) return { lo: fLo, hi: fHi };
  const allowed = Math.max(0, budget - fLo - fHi);
  if (share === "equal") {
    const cut = Math.min(soft, lo + hi - fLo - fHi - allowed);
    const cutLo = Math.min(softLo, Math.max(cut / 2, cut - softHi));
    return { lo: lo - cutLo, hi: hi - (cut - cutLo) };
  }
  const k = Math.min(1, allowed / soft);
  return { lo: fLo + (lo - fLo) * k, hi: fHi + (hi - fHi) * k };
}

export interface SafeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The camera that puts something at the centre of the space left by the panels, the single home of this formula:
 * `worldToScreen` draws against the raw screen centre, so the camera moves back by half the difference of the left and
 * right insets, divided by the zoom factor (a screen offset is a shorter world distance the further in).
 */
export function centerForInsets(
  cx: number,
  cy: number,
  insets: SafeInsets,
  scale: number,
): { tx: number; ty: number } {
  const safeScale = Math.abs(scale) < 1e-6 ? 1 : scale;
  return {
    tx: cx - (insets.left - insets.right) / (2 * safeScale),
    ty: cy - (insets.top - insets.bottom) / (2 * safeScale),
  };
}

/**
 * The overview fit reserves a bottom allowance so the bottom-most spine node's label anchor
 * (`radius + LABEL_OFFSET`) stays inside the label cull line. Derived from `LABEL_OFFSET` (max
 * plus 4 slack) so it cannot drift; applied to the fit only, not to the cull rect or movable area.
 */
const OVERVIEW_LABEL_BOTTOM_ALLOWANCE = Math.max(...Object.values(LABEL_OFFSET)) + 4;

export interface OverviewFitOptions {
  padPx?: { left: number; right: number; top: number; bottom: number };
  scaleFloor?: number;
  /** Zero when a branch scene already reserves its own screen-space label pad. */
  labelBottomAllowance?: number;
}

export function readSafeInsets(
  tokens: SafeInsetTokens,
  viewportWidth?: number,
  viewportHeight?: number,
  pad?: OverviewFitOptions["padPx"],
  labelBottomAllowance = OVERVIEW_LABEL_BOTTOM_ALLOWANCE,
): SafeInsets {
  const raw = {
    left: (tokens.safeInsetLeft ?? 0) + (pad?.left ?? 0),
    right: (tokens.safeInsetRight ?? 0) + (pad?.right ?? 0),
    top: (tokens.safeInsetTop ?? 0) + (pad?.top ?? 0),
    // No insets specified (= the pure fit test contract, with no chrome) stays 0 as
    // before — the label allowance is added only when a real bottom chrome inset exists.
    bottom:
      tokens.safeInsetBottom == null
        ? pad?.bottom ?? 0
        : tokens.safeInsetBottom + labelBottomAllowance + (pad?.bottom ?? 0),
  };
  // The chrome may not eat the map (`MAX_FIT_CHROME_SHARE`). Callers without a
  // viewport — the pan leash — keep the raw numbers.
  const x =
    viewportWidth === undefined
      ? { lo: raw.left, hi: raw.right }
      : clampFitInsets(raw.left, raw.right, viewportWidth, tokens.obstacleInsetLeft ?? 0, tokens.obstacleInsetRight ?? 0, "equal");
  const y =
    viewportHeight === undefined ? { lo: raw.top, hi: raw.bottom } : clampFitInsets(raw.top, raw.bottom, viewportHeight);
  return { left: x.lo, right: x.hi, top: y.lo, bottom: y.hi };
}
