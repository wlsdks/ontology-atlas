/**
 * Node label paint — ported from the B2+ prototype's `drawTracked()`/
 * `drawLabel()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * Per-kind label behavior (never overlapping — each kind only appears in its
 * own altitude range, `docs/TOPOLOGY-V2-DESIGN.md` §3.1):
 * - `project`: always visible, plain text, no letter-tracking.
 * - `domain`: alpha = `farT` — tracked (manual letter-spacing, since Canvas
 *   2D has no native `letter-spacing`) uppercase "sky-chart" label, only
 *   readable once altitude rises into the transition band.
 * - `capability`: alpha = `(1-farT) * smoothstep(0.75, 1.02, cameraScale)` —
 *   only in working/close-zoom range, fades before reaching far field.
 * - `element`: alpha = `(1-farT) * smoothstep(1.55, 1.95, cameraScale)` —
 *   deepest zoom only.
 * - Focused node + its neighbors get a label-alpha floor override (never
 *   fully hidden while focus is active), except capability/element labels
 *   which still respect their own zoom gates even while focused (prototype
 *   `drawLabel()`'s focus branch explicitly excludes those two kinds).
 *
 * `computeLabelAlpha` extracts the per-kind alpha formula above (a plain
 * function evaluation, unit-tested in `labels.test.ts` without a canvas).
 * `draw()` itself is Canvas 2D text painting — its visual legibility (light
 * mode contrast in particular) is left as `test.todo`, a Design Guardian
 * screenshot-review question rather than a formula this file gets wrong.
 */

import { smoothstep } from "../model/altitude";

export interface LabelDrawState {
  kind: "project" | "domain" | "capability" | "element";
  text: string;
  screenX: number;
  screenY: number;
  /** World-space node radius × camera.scale (used to offset label below the node). */
  screenRadius: number;
  farT: number;
  cameraScale: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
}

export interface LabelTokens {
  labelDomain: string;
  labelCapability: string;
  labelElement: string;
}

/**
 * Resolves a label's opacity for this frame — `0` whenever the node is
 * `"dim"` (ego focus owns visibility there), the per-kind zoom-gated formula
 * otherwise, floored to fully-visible for the focused node + its neighbors
 * (capability/element excluded — they keep respecting their own zoom gate
 * even while focused, prototype `drawLabel()`'s explicit exclusion).
 */
export function computeLabelAlpha(
  kind: LabelDrawState["kind"],
  farT: number,
  cameraScale: number,
  egoState: LabelDrawState["egoState"],
): number {
  if (egoState === "dim") return 0;

  let alpha: number;
  if (kind === "project") alpha = 1;
  else if (kind === "domain") alpha = farT;
  else if (kind === "capability") alpha = (1 - farT) * smoothstep(0.75, 1.02, cameraScale);
  else alpha = (1 - farT) * smoothstep(1.55, 1.95, cameraScale);

  const isFocusedOrNeighbor = egoState === "center" || egoState === "neighbor";
  if (isFocusedOrNeighbor && kind !== "capability" && kind !== "element") {
    alpha = Math.max(alpha, farT > 0.5 ? 1 : alpha);
  }
  return alpha;
}

/** Screen-Y offset below the node's own radius, per kind (prototype `drawLabel()`). */
const LABEL_OFFSET: Record<LabelDrawState["kind"], number> = {
  project: 20,
  domain: 17,
  capability: 13,
  element: 13,
};

/** Manual letter-tracking for canvas text (no native `letter-spacing`) — ported from `drawTracked()`. */
function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
  tracking: number,
  alpha: number,
): void {
  const widths: number[] = [];
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = ctx.measureText(text[i]).width;
    widths.push(width);
    total += width + (i < text.length - 1 ? tracking : 0);
  }
  let x = cx - total / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < text.length; i += 1) {
    ctx.fillText(text[i], x, cy);
    x += widths[i] + tracking;
  }
  ctx.globalAlpha = 1;
}

/** Draws one node's label (or nothing, if this kind/zoom/ego combination resolves to alpha<=0.02). */
export function draw(ctx: CanvasRenderingContext2D, state: LabelDrawState, tokens: LabelTokens): void {
  const { kind, text, screenX: x, screenY: y, screenRadius: r, farT, cameraScale, egoState } = state;
  const alpha = computeLabelAlpha(kind, farT, cameraScale, egoState);
  if (alpha <= 0.02) return;

  const ty = y + r + LABEL_OFFSET[kind];

  if (kind === "domain") {
    ctx.font = "600 10px -apple-system, 'SF Pro Text', sans-serif";
    drawTrackedText(ctx, text.toUpperCase(), x, ty, tokens.labelDomain, 1.6, alpha);
    return;
  }

  if (kind === "project") {
    ctx.font = "600 13px -apple-system, 'SF Pro Text', sans-serif";
    ctx.fillStyle = "#ececf0"; // project label has no dedicated §2.2 token, prototype literal
  } else if (kind === "capability") {
    ctx.font = "500 10.5px -apple-system, 'SF Pro Text', sans-serif";
    ctx.fillStyle = tokens.labelCapability;
  } else {
    ctx.font = "400 9.5px -apple-system, 'SF Pro Text', sans-serif";
    ctx.fillStyle = tokens.labelElement;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = alpha;
  ctx.fillText(text, x, ty);
  ctx.globalAlpha = 1;
}
