/**
 * Pure Canvas 2D drawing of the chip standing in for a collapsed parent's children: neutral surface
 * plus the single indigo (`docs/DESIGN-SYSTEM.md`). Hit-testing and drawing must use the same
 * rectangle, so `clusterChipRect`, `clusterChipLabel` and `clusterChipScale` are the single source.
 */

import type { ExpandAffordance } from "@/shared/lib/preferences/appearance-preferences";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { lerpColorHex } from "./grid";

/** Chip base height (px, screen space — multiplied by `clusterChipScale`). */
export const CLUSTER_CHIP_HEIGHT = 28;
const CHIP_FONT_SIZE = 13;
/** Approximate mono advance width (px) — deterministic so hit and draw agree. */
const CHIP_CHAR_WIDTH = 7.8;
/** Leading zone before the composite `＋N` (px) — tightens the pill, seats the `＋`. */
const CHIP_GLYPH_WIDTH = 14;
const CHIP_PAD_X = 9;

export interface ClusterChipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Follows the camera within a narrow band so the chip stays legible; hit and draw share it. */
export function clusterChipScale(cameraScale: number): number {
  if (!Number.isFinite(cameraScale)) return 1;
  return Math.min(1.5, Math.max(0.85, cameraScale));
}

/** Collapsed = `+N`, expanded = `− N` — the count stays, so the meaning survives. */
export function clusterChipLabel(count: number, expanded: boolean): string {
  return expanded ? `− ${count}` : `+${count}`;
}

/**
 * Badge label, the compact counterpart of the pill's `+N`. `expanded` defaults to `true`; a collapsed
 * shoulder badge must say `+N`.
 */
export function clusterBadgeLabel(count: number, expanded: boolean = true): string {
  return expanded ? `−${count}` : `+${count}`;
}

/** Bar base height (px, screen space): between the badge (18) and the pill (28); it carries words, so it cannot shrink to badge size. */
export const CLUSTER_BAR_HEIGHT = 24;
/** Clearance lifting the bar **above** the parent's radius (screen px, zoom-invariant). */
const BAR_NODE_LIFT = 12;
const BAR_FONT_SIZE = 12;
/** The bar uses the body stack, not mono: mono has no Hangul and falls back, which makes the width estimator below unknowable. */
const BAR_FONT_FAMILY = "-apple-system, 'SF Pro Text', sans-serif";
const BAR_PAD_X = 10;

/**
 * Two cells wide (Hangul, Han, kana, fullwidth). A Latin-calibrated width underestimates Hangul by
 * ~40% (10.38 vs ~7 px at weight 600, 12 px), pushing glyphs outside the hit rectangle.
 */
function isWideGlyph(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // Hangul jamo
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) || // CJK radicals ~ Han ~ kana ~ compatibility jamo
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

/**
 * Deterministic text width without `ctx`, the single ruler for the bar rectangle: hit-testing and label
 * reservation have no canvas, and two rulers make draw and hit diverge. The coefficients are headless-Chromium
 * measurements (weight 600, 12 px) plus margin, so always wider than reality.
 */
export function estimateCanvasTextWidth(text: string, fontSize: number): number {
  let cells = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isWideGlyph(cp)) cells += 0.92;
    else if (cp === 0x20) cells += 0.32;
    else if (cp >= 0x30 && cp <= 0x39) cells += 0.62;
    else if (cp >= 0x41 && cp <= 0x5a) cells += 0.72;
    else cells += 0.58;
  }
  return cells * fontSize;
}

export interface ClusterBarLabels {
  /** The bare verb: the node already engraves the count (`clusterBarLabel`), unlike the toolbar's "expand all". */
  expand: string;
  /** How many this press opens. Contains a `{count}` placeholder. */
  expandCount: string;
  collapse: string;
}

/** Fallback when the caller passes no labels; seeing it means the wiring is broken (a contract test guards that). */
const FALLBACK_CLUSTER_BAR_LABELS: ClusterBarLabels = {
  expand: "Expand",
  expandCount: "Expand {count}",
  collapse: "Collapse",
};

/**
 * The bar's label: one function for draw, hit-test and label reservation. The number is spoken
 * only when it is information: "Expand all" when the press opens everything left, "Expand N"
 * when only some.
 */
export function clusterBarLabel(input: {
  expanded: boolean;
  count: number;
  batchSize: number;
  labels?: ClusterBarLabels;
}): string {
  const labels = input.labels ?? FALLBACK_CLUSTER_BAR_LABELS;
  if (input.expanded) return labels.collapse;
  const opens = Math.max(1, Math.min(Math.floor(input.batchSize), input.count));
  return opens >= input.count
    ? labels.expand
    : labels.expandCount.replace("{count}", String(opens));
}

/** Directly above the parent's head; one source for draw, hit-test and occupancy so click coordinates cannot drift. */
export function clusterBarRect(
  parentScreenX: number,
  parentScreenY: number,
  nodeScreenRadius: number,
  label: string,
  scale: number = 1,
): ClusterChipRect {
  const w = (estimateCanvasTextWidth(label, BAR_FONT_SIZE) + BAR_PAD_X * 2) * scale;
  const h = CLUSTER_BAR_HEIGHT * scale;
  const bottom = parentScreenY - nodeScreenRadius - BAR_NODE_LIFT;
  return { x: parentScreenX - w / 2, y: bottom - h, w, h };
}

interface ClusterBarDrawInput {
  parentScreenX: number;
  parentScreenY: number;
  nodeScreenRadius: number;
  count: number;
  expanded: boolean;
  hovered: boolean;
  /** How many one press opens — decides "all" vs "N" in the label. */
  batchSize: number;
  labels?: ClusterBarLabels;
  scale?: number;
}

/** An opaque plate with a verb: the bar overlaps nodes by design, and a translucent plate lets edges and numerals bleed between letters. */
function drawClusterBar(
  ctx: CanvasRenderingContext2D,
  input: ClusterBarDrawInput,
  colors: ClusterChipColors,
): void {
  const scale = input.scale ?? 1;
  const label = clusterBarLabel(input);
  const rect = clusterBarRect(
    input.parentScreenX,
    input.parentScreenY,
    input.nodeScreenRadius,
    label,
    scale,
  );

  // A tighter radius than the pill tells the docked bar from the floating pill by silhouette.
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 7 * scale);
  ctx.fillStyle = input.hovered ? colors.hoverSurface : colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = input.hovered ? colors.hoverBorder : colors.border;
  ctx.stroke();

  // Centred without measuring: `clusterBarRect` is the only ruler.
  ctx.font = `${FONT_WEIGHT.strong} ${BAR_FONT_SIZE * scale}px ${BAR_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = input.hovered ? colors.hoverInk : colors.barInk ?? colors.numeralInk;
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export type ClusterControlForm = "pill" | "bar" | "badge" | "none";

export interface ClusterControlInput {
  affordance: ExpandAffordance;
  expanded: boolean;
  /**
   * Whether this parent is the selected node. The `bar` affordance exists only then: a collapsed
   * parent's count is already engraved on the node, so a permanent control would repeat the fact.
   */
  focused: boolean;
  /**
   * Whether the chip can dock to a node, i.e. the parent's screen position is known. The
   * batch-reveal `+N more` chip has a synthetic parent id, so it stays in the non-docking form
   * (pill). Omitted means `true`.
   */
  dockable?: boolean;
}

/**
 * Affordance + state → the form to draw; draw, hit-testing and label reservation all read it, or a button
 * is visible but not pressable. `pill`: floating collapsed, shoulder badge expanded; `badge`: shoulder badge
 * in both states; `bar`: directly above the selected node only.
 */
export function clusterControlForm(input: ClusterControlInput): ClusterControlForm {
  if (input.affordance === "bar") {
    if (!input.focused) return "none";
    return input.dockable === false ? "pill" : "bar";
  }
  if (input.affordance === "badge") return input.dockable === false ? "pill" : "badge";
  return input.expanded ? "badge" : "pill";
}

/** Badge base height (px, screen space) — a mini badge, smaller than the pill (28). */
export const CLUSTER_BADGE_HEIGHT = 18;
const BADGE_FONT_SIZE = 11;
/** Approximate badge mono advance width (px) — deterministic so hit and draw agree. */
const BADGE_CHAR_WIDTH = 6.6;
const BADGE_PAD_X = 6;
/** Clearance outside the parent's radius (screen px, zoom-invariant), larger than the expanded aura ring offset (6) so the badge touches neither. */
const BADGE_NODE_CLEARANCE = 10;

/*
 * A selected node has this control and the DOM orbit button, so they take different bearings: bar north,
 * badge northwest, orbit button east (swept by `expand-settings.contract.test.ts`, radii 7-40).
 */
const ORBIT_BUTTON_CLEARANCE = 14;
/** Orbit button diameter (px) — the DOM side's `h-7 w-7`. The contract test measures from this. */
const ORBIT_BUTTON_SIZE = 28;

/** Same formula as the DOM placement (`use-topology-loop.ts`); written twice, one side moves alone and the overlap returns. */
export function orbitButtonRect(
  parentScreenX: number,
  parentScreenY: number,
  nodeScreenRadius: number,
): ClusterChipRect {
  const cx = parentScreenX + nodeScreenRadius + ORBIT_BUTTON_CLEARANCE;
  return {
    x: cx - ORBIT_BUTTON_SIZE / 2,
    y: parentScreenY - ORBIT_BUTTON_SIZE / 2,
    w: ORBIT_BUTTON_SIZE,
    h: ORBIT_BUTTON_SIZE,
  };
}

/**
 * The expanded `-N` badge sits 45 degrees out from the node by radius plus clearance, on the
 * shoulder bearing above, riding the camera. Draw and hit take the same rectangle from here.
 */
export function clusterBadgeRect(
  parentScreenX: number,
  parentScreenY: number,
  nodeScreenRadius: number,
  label: string,
  scale: number = 1,
): ClusterChipRect {
  const textW = label.length * BADGE_CHAR_WIDTH;
  const w = (textW + BADGE_PAD_X * 2) * scale;
  const h = CLUSTER_BADGE_HEIGHT * scale;
  const diag = Math.SQRT1_2; // cos(45°) = sin(45°)
  const reach = nodeScreenRadius + BADGE_NODE_CLEARANCE + h / 2;
  // The left shoulder (the right is the orbit button's bearing), and the right edge never passes the node
  // centre: a wide label grows the badge leftwards and the bearing holds.
  const cx = Math.min(parentScreenX - reach * diag, parentScreenX - w / 2);
  const cy = parentScreenY - reach * diag;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * The badge seat's centre, independent of label width. The pill and the expanded badge sit 51-147 px apart
 * (measured), so the pill travels here while it fades and the crossfade reads as one mark moving.
 */
export function clusterBadgeCenter(
  parentScreenX: number,
  parentScreenY: number,
  nodeScreenRadius: number,
  scale: number = 1,
): { x: number; y: number } {
  const diag = Math.SQRT1_2;
  const reach = nodeScreenRadius + BADGE_NODE_CLEARANCE + (CLUSTER_BADGE_HEIGHT * scale) / 2;
  return { x: parentScreenX - reach * diag, y: parentScreenY - reach * diag };
}

/**
 * Where the collapsed pill is drawn: the anchor moved toward the badge seat by `revealT` (0→1 on expand,
 * 1→0 on collapse). Without parent coordinates it stays put, since moving without a destination is drift.
 */
export function clusterChipTravelPoint(input: {
  screenX: number;
  screenY: number;
  parentScreenX?: number;
  parentScreenY?: number;
  nodeScreenRadius?: number;
  revealT?: number;
  scale?: number;
}): { x: number; y: number } {
  const t = input.revealT;
  if (
    t === undefined ||
    t <= 0 ||
    input.parentScreenX === undefined ||
    input.parentScreenY === undefined ||
    input.nodeScreenRadius === undefined
  ) {
    return { x: input.screenX, y: input.screenY };
  }
  const clamped = Math.min(1, Math.max(0, t));
  const dest = clusterBadgeCenter(
    input.parentScreenX,
    input.parentScreenY,
    input.nodeScreenRadius,
    input.scale ?? 1,
  );
  return {
    x: input.screenX + (dest.x - input.screenX) * clamped,
    y: input.screenY + (dest.y - input.screenY) * clamped,
  };
}

interface ClusterBadgeDrawInput {
  parentScreenX: number;
  parentScreenY: number;
  /** Parent's base screen radius (`radiusForKind × magnitudeScale × cameraScale`). */
  nodeScreenRadius: number;
  count: number;
  hovered: boolean;
  /** Decides the label's sign (`−N` / `+N`); defaults to `true`. */
  expanded?: boolean;
  scale?: number;
}

/** A mini `−N` on the parent's shoulder, only a collapse affordance; the caller has set `ctx.globalAlpha` to the parent's tier alpha. */
function drawClusterBadge(
  ctx: CanvasRenderingContext2D,
  input: ClusterBadgeDrawInput,
  colors: ClusterChipColors,
): void {
  const scale = input.scale ?? 1;
  const label = clusterBadgeLabel(input.count, input.expanded ?? true);
  const rect = clusterBadgeRect(input.parentScreenX, input.parentScreenY, input.nodeScreenRadius, label, scale);

  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  // Neutral numeral ink, not indigoBright: the focused node stays the attention winner.
  ctx.fillStyle = colors.numeralInk;
  ctx.font = `${FONT_WEIGHT.strong} ${BADGE_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** The chip rectangle from its anchor (chip centre, screen coordinates), shared by draw and hit. */
export function clusterChipRect(
  screenX: number,
  screenY: number,
  label: string,
  scale: number = 1,
): ClusterChipRect {
  const textW = label.length * CHIP_CHAR_WIDTH;
  const w = (CHIP_GLYPH_WIDTH + textW + CHIP_PAD_X * 2) * scale;
  const h = CLUSTER_CHIP_HEIGHT * scale;
  return { x: screenX - w / 2, y: screenY - h / 2, w, h };
}

/**
 * `greedyPlaceLabels` reserves the chip's rectangle, so this takes the same branches as
 * `drawClusterChip`: null while fading out, the badge when expanded, the pill when collapsed.
 * Edit both together (`cluster-chips.test.ts`), or labels dodge empty space or overlap chips.
 */
export function clusterChipOccupancyRect(input: ClusterChipDrawInput): ClusterChipRect | null {
  const scale = input.scale ?? 1;
  const dockedNow =
    input.parentScreenX !== undefined &&
    input.parentScreenY !== undefined &&
    input.nodeScreenRadius !== undefined;
  const form = clusterControlForm({
    affordance: input.affordance ?? "pill",
    expanded: input.expanded,
    focused: input.focused ?? false,
    dockable: dockedNow,
  });
  if (form === "none") return null;
  // Same formula as drawClusterChip's formAlpha — a form ramping out occupies nothing.
  const formAlpha =
    input.revealT === undefined
      ? 1
      : Math.min(1, Math.max(0, input.expanded ? input.revealT : 1 - input.revealT));
  if (formAlpha < 0.01) return null;

  if (form === "bar") {
    return clusterBarRect(
      input.parentScreenX as number,
      input.parentScreenY as number,
      input.nodeScreenRadius as number,
      clusterBarLabel({
        expanded: input.expanded,
        count: input.count,
        batchSize: input.batchSize ?? input.count,
        labels: input.barLabels,
      }),
      scale,
    );
  }

  if (form === "badge") {
    // The floating-pill affordance's expanded badge has no docking fallback: when it cannot dock nothing is
    // drawn. `badge` and `bar` get their fallback as `pill` in `clusterControlForm`.
    if (!dockedNow) return null;
    return clusterBadgeRect(
      input.parentScreenX as number,
      input.parentScreenY as number,
      input.nodeScreenRadius as number,
      clusterBadgeLabel(input.count, input.expanded),
      scale,
    );
  }

  // Occupancy follows the travel, or label avoidance dodges empty space instead of the ink.
  const travel = clusterChipTravelPoint(input);
  return clusterChipRect(travel.x, travel.y, clusterChipLabel(input.count, false), scale);
}

export interface ClusterChipColors {
  surface: string;
  /** Rest hairline border (neutral nodeStrokeDomain) — never competes with selection indigo. */
  border: string;
  plusInk: string;
  numeralInk: string;
  /** Rest ink of the bar's text, falling back to `numeralInk`: the bar is summoned after selection, so the permanent-chrome ink would be unreadably darker than a background node's outline. */
  barInk?: string;
  /** Parent→chip tether stroke (edgeContains — offset in lightness from the depends ink). */
  tether: string;
  hoverSurface: string;
  hoverBorder: string;
  hoverInk: string;
}

/** Manual rounded-rect path — `ctx.roundRect` is missing in jsdom and similar. */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export interface ClusterChipDrawInput {
  screenX: number;
  screenY: number;
  count: number;
  expanded: boolean;
  hovered: boolean;
  /** Hover easing 0..1 for colour interpolation only (~150 ms ramp, snaps under reduced motion); omitted falls back to `hovered`. */
  hoverT?: number;
  /** Reveal ramp 0..1 fading whichever form is on screen (badge = revealT, pill = 1−revealT); omitted means alpha 1, a hard swap. */
  revealT?: number;
  scale?: number;
  /** Parent screen coordinates — when present, a short dashed parent→chip connector is drawn. */
  parentScreenX?: number;
  parentScreenY?: number;
  /** Parent's base screen radius; with the parent coordinates it routes the draw to `drawClusterBadge` while `expanded`. */
  nodeScreenRadius?: number;
  /** The "Expand → Reveal control" setting; omitted means `"pill"`. */
  affordance?: ExpandAffordance;
  /** Is this parent the selected node — the `"bar"` affordance's precondition. Defaults to false. */
  focused?: boolean;
  /** The "How many one press opens" setting — decides "all" vs "N". */
  batchSize?: number;
  /** Bar wording, translated by the caller. */
  barLabels?: ClusterBarLabels;
}

/** Draws one chip, multiplying into the caller's `ctx.globalAlpha` (the parent's tier alpha) and restoring it. */
export function drawClusterChip(
  ctx: CanvasRenderingContext2D,
  input: ClusterChipDrawInput,
  colors: ClusterChipColors,
): void {
  const scale = input.scale ?? 1;
  const affordance = input.affordance ?? "pill";
  const docked =
    input.parentScreenX !== undefined &&
    input.parentScreenY !== undefined &&
    input.nodeScreenRadius !== undefined;
  const form = clusterControlForm({
    affordance,
    expanded: input.expanded,
    focused: input.focused ?? false,
    dockable: docked,
  });
  // The bar affordance gives an unselected parent no control; occupancy returns null from the same decision.
  if (form === "none") return;

  if (form === "bar") {
    drawClusterBar(
      ctx,
      {
        parentScreenX: input.parentScreenX as number,
        parentScreenY: input.parentScreenY as number,
        nodeScreenRadius: input.nodeScreenRadius as number,
        count: input.count,
        expanded: input.expanded,
        hovered: input.hovered,
        batchSize: input.batchSize ?? input.count,
        labels: input.barLabels,
        scale,
      },
      colors,
    );
    return;
  }

  // The badge affordance is a badge in both states, with no pill to crossfade; only the sign flips.
  if (form === "badge" && affordance === "badge") {
    drawClusterBadge(
      ctx,
      {
        parentScreenX: input.parentScreenX as number,
        parentScreenY: input.parentScreenY as number,
        nodeScreenRadius: input.nodeScreenRadius as number,
        count: input.count,
        expanded: input.expanded,
        hovered: input.hovered,
        scale,
      },
      colors,
    );
    return;
  }

  // Both forms are drawn while the reveal ramp runs: branching on `expanded` and drawing one would
  // skip the crossfade and never reach `clusterChipTravelPoint` on expand. Omitted `revealT` is 1.
  const baseAlpha = ctx.globalAlpha;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const badgeAlpha =
    input.revealT === undefined ? (input.expanded ? 1 : 0) : clamp01(input.revealT);
  const pillAlpha =
    input.revealT === undefined ? (input.expanded ? 0 : 1) : clamp01(1 - input.revealT);
  if (badgeAlpha < 0.01 && pillAlpha < 0.01) return;

  // The expanded form is the shoulder badge, which needs the parent coordinates and node radius; without them nothing is drawn.
  if (
    badgeAlpha >= 0.01 &&
    input.parentScreenX !== undefined &&
    input.parentScreenY !== undefined &&
    input.nodeScreenRadius !== undefined
  ) {
    ctx.globalAlpha = baseAlpha * badgeAlpha;
    drawClusterBadge(
      ctx,
      {
        parentScreenX: input.parentScreenX,
        parentScreenY: input.parentScreenY,
        nodeScreenRadius: input.nodeScreenRadius,
        count: input.count,
        hovered: input.hovered,
        scale,
      },
      colors,
    );
  }

  if (pillAlpha < 0.01) {
    ctx.globalAlpha = baseAlpha;
    return;
  }
  ctx.globalAlpha = baseAlpha * pillAlpha;

  // The departing or arriving pill is always the collapsed `+N`, or both ends of the crossfade would say the same thing.
  const label = clusterChipLabel(input.count, false);
  // While fading the pill walks to the badge seat; at rest (revealT 0 or omitted) it stays on the anchor.
  const travel = clusterChipTravelPoint(input);
  const rect = clusterChipRect(travel.x, travel.y, label, scale);

  // Hover easing is colour only: quiet neutral waking to indigo; no transform, zoom step or glow.
  const t = input.hoverT ?? (input.hovered ? 1 : 0);
  const mix = (rest: string, hover: string): string =>
    t <= 0 ? rest : t >= 1 ? hover : lerpColorHex(rest, hover, t);
  const surface = mix(colors.surface, colors.hoverSurface);
  const border = mix(colors.border, colors.hoverBorder);
  const plusColor = mix(colors.plusInk, colors.hoverInk);
  const numColor = mix(colors.numeralInk, colors.hoverInk);

  // The tether's texture differs from the depends dashes so it does not join the edge soup; the pill is filled afterwards and covers its inner segment.
  if (input.parentScreenX !== undefined && input.parentScreenY !== undefined) {
    ctx.save();
    ctx.setLineDash([3 * scale, 3 * scale]);
    ctx.beginPath();
    ctx.moveTo(input.parentScreenX, input.parentScreenY);
    ctx.lineTo(travel.x, travel.y);
    ctx.strokeStyle = colors.tether;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(input.parentScreenX, input.parentScreenY, 2 * scale, 0, Math.PI * 2);
    ctx.fillStyle = colors.plusInk;
    ctx.fill();
    ctx.restore();
  }

  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = border;
  ctx.stroke();

  // `＋` indigo, numeral neutral, caret in the border ink; the hit box comes from the rect above, so the text centres freely.
  ctx.font = `${FONT_WEIGHT.strong} ${CHIP_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const plus = "+";
  const num = String(input.count);
  const caret = ` ${input.hovered ? "⌄" : "›"}`;
  const plusW = ctx.measureText(plus).width;
  const numW = ctx.measureText(num).width;
  const caretW = ctx.measureText(caret).width;
  const ty = travel.y + 0.5 * scale;
  let tx = travel.x - (plusW + numW + caretW) / 2;
  ctx.fillStyle = plusColor;
  ctx.fillText(plus, tx, ty);
  tx += plusW;
  ctx.fillStyle = numColor;
  ctx.fillText(num, tx, ty);
  tx += numW;
  ctx.fillStyle = border;
  ctx.fillText(caret, tx, ty);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = baseAlpha;
}
