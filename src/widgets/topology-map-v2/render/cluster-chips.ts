/**
 * Cluster chips — pure Canvas 2D drawing of the "chip" that stands in for a
 * collapsed parent's children. Neutral surface plus the single indigo only
 * (`docs/DESIGN-SYSTEM.md` single-indigo charter) — no new hue, no glow.
 *
 * Owner report: "+63 reads like dust; I can't tell what it means" (the ＋63 reads
 * like dust; I can't tell what it means). The stacked node-glyph rendering it
 * describes measured ~1.1:1 contrast. Three consequences:
 * ① A single composite `＋N` in the leading zone (`＋` indigo, numeral neutral
 *    numeralFace mono tabular) so "N collapsed" reads as one mark.
 * ② Rest is a quiet neutral pill that never competes with the indigo of a real
 *    node selection; only hover wakes it to indigo (colour interpolation only,
 *    ~150ms — no transform, no zoom step, no glow).
 * ③ The parent→chip tether is textured unlike the depends dashes and pins a 2px
 *    indigo dot at the parent end, so membership reads without joining the
 *    'edge soup'.
 *
 * Hit-testing (`ui/topology-pointer-handlers.ts`) and drawing must use the
 * **same rectangle** or clicks land off target, so `clusterChipRect` is the
 * single source (no ctx needed — font width is approximated deterministically),
 * as are `clusterChipLabel` and `clusterChipScale`.
 */

import type { ExpandAffordance } from "@/shared/lib/appearance-preferences";
import { FONT_WEIGHT } from "@/shared/ui/font-weight";
import { lerpColorHex } from "./grid";

/** Chip base height (px, screen space — multiplied by `clusterChipScale`). */
export const CLUSTER_CHIP_HEIGHT = 28;
/** Mono font base size (px). */
const CHIP_FONT_SIZE = 13;
/** Approximate mono advance width (px) — deterministic so hit and draw agree. */
const CHIP_CHAR_WIDTH = 7.8;
/** Leading zone before the composite `＋N` (px) — tightens the pill, seats the `＋`. */
const CHIP_GLYPH_WIDTH = 14;
/** Horizontal text padding. */
const CHIP_PAD_X = 9;

export interface ClusterChipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Chip zoom factor — follows the camera but clamps to a narrow band so the chip
 * stays legible. Hit and draw call the **same** function, so the rectangles agree.
 */
export function clusterChipScale(cameraScale: number): number {
  if (!Number.isFinite(cameraScale)) return 1;
  return Math.min(1.5, Math.max(0.85, cameraScale));
}

/** Collapsed = `+N`, expanded = `− N` — the count stays, so the meaning survives. */
export function clusterChipLabel(count: number, expanded: boolean): string {
  return expanded ? `− ${count}` : `+${count}`;
}

/**
 * Badge label — the compact counterpart of the pill's `+N` (no space). The badge
 * is docked to the parent node and therefore tighter than the pill label.
 *
 * `expanded` arrived with the shoulder-badge affordance (2026-08-01), where the
 * badge is present **while collapsed too** and must say `+N`. It defaults to
 * `true`, so the earlier callers (expanded badge) are unchanged.
 */
export function clusterBadgeLabel(count: number, expanded: boolean = true): string {
  return expanded ? `−${count}` : `+${count}`;
}

/* ── Overhead bar (the "directly above the selected node" affordance) ─────── */

/**
 * Bar base height (px, screen space). Lower than the pill (28) and taller than
 * the badge (18): docked to a node it need not be pill-sized, but it carries
 * words so it cannot shrink to badge size.
 */
export const CLUSTER_BAR_HEIGHT = 24;
/** Clearance lifting the bar **above** the parent's radius (screen px, zoom-invariant). */
const BAR_NODE_LIFT = 12;
/** Bar font base size (px). */
const BAR_FONT_SIZE = 12;
/**
 * The bar's font — **the body stack, not mono.**
 *
 * The bar carries a sentence (「Expand all」 — "Expand all"), not a number, so
 * it needs no tabular alignment. More importantly the mono stack has no Hangul
 * and falls back, which makes the advance width depend on how the stack
 * resolves and leaves the estimator below measuring something unknowable. This
 * is the stack the map labels (`render/labels.ts`) already use.
 */
const BAR_FONT_FAMILY = "-apple-system, 'SF Pro Text', sans-serif";
/** Horizontal text padding of the bar (px). */
const BAR_PAD_X = 10;

/**
 * Is this glyph **two cells wide** — Hangul, Han, kana, fullwidth.
 *
 * A Latin-calibrated `length × constant` underestimates Hangul width by nearly
 * 40% (measured at weight 600, 12px: Hangul syllable 10.38px vs Latin lowercase
 * ≈7px). Drawing the plate from an underestimate pushes glyphs outside it, and
 * outside the plate is outside the hit rectangle — **text you can see but
 * cannot click**.
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
 * **Deterministic** text width measured without `ctx` — the single source for
 * the bar rectangle.
 *
 * Why not `ctx.measureText`: the place that builds the rectangle
 * (`clusterBarRect`) has no canvas — hit-testing and label reservation call the
 * same function. Two rulers means draw and hit diverge, and this file has hit
 * that defect twice already. So **this is the only ruler**, and `drawClusterBar`
 * measures nothing: it just centres the text in this rectangle.
 *
 * The coefficients are headless-Chromium measurements (weight 600, 12px, the
 * stack above) plus safety margin, so they are **always wider than reality** —
 * too narrow punches glyphs through the plate, too wide only adds a little
 * padding. Measured/estimated: 「Expand all」 (Expand all) 55.2/59.0 · 「Collapse」
 * (Collapse) 20.8/22.1 · `Collapse` 50.0/57.4.
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

/**
 * The **sentence** the bar says — the caller translates it and passes it in.
 * Drawing i18n strings on the canvas is not a new capability: the warding
 * caption (`wardingRing.caption`) already receives translated text the same way.
 */
export interface ClusterBarLabels {
  /** One press opens **everything** left. Carries no number — see `clusterBarLabel`. */
  expandAll: string;
  /** How many this press opens. Contains a `{count}` placeholder. */
  expandCount: string;
  /** Collapse what is expanded. */
  collapse: string;
}

/**
 * Last-resort fallback when the caller passes no labels. Seeing it on screen
 * means the wiring is broken; a contract test guards that wiring separately.
 */
export const FALLBACK_CLUSTER_BAR_LABELS: ClusterBarLabels = {
  expandAll: "Expand all",
  expandCount: "Expand {count}",
  collapse: "Collapse",
};

/**
 * The bar's label — **one function for draw, hit-test, and label reservation**.
 *
 * **Why 「Expand all」 (Expand all) and not 「Expand N」 (Expand N)** — owner
 * report, 2026-08-02. The bar used to read `+17` while the node right below it
 * was engraved `17`: **the same number said twice, and never a verb.** The
 * engraving answers "how many are here" (the total), the bar answers "what
 * happens if I press" (how many this press opens) — different facts, but in the
 * common case where one press opens everything the two numbers coincide.
 *
 * So **the number is spoken only when it is information**: if this press opens
 * everything left, "Expand all" (no number — the engraving already said it); if
 * only some, "Expand N". Tufte's data-ink discipline applied to wording.
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
    ? labels.expandAll
    : labels.expandCount.replace("{count}", String(opens));
}

/**
 * The overhead bar's rectangle — **directly above the parent's head. Always.**
 *
 * The pill *searches* for a free spot. When the search succeeds nothing
 * overlaps, but in dense regions it drifts away from its parent and the screen
 * stops saying **whose button this is**. The bar removes the search: something
 * always in the same place is something the eye never hunts for.
 *
 * Single source for draw, hit-test, and occupancy — all three call this one
 * function, so click coordinates cannot drift (the convention the pill and
 * badge already follow).
 *
 * **May the plate be wider than the node — yes, this plate only** (2026-08-02,
 * reversing an earlier call). The earlier call read "a control larger than its
 * data is an ink inversion" and squeezed the plate inside the node diameter
 * (41.6 within 48). Its premise was that the plate says **one number**, and that
 * was right at the time: a plate saying nothing more has no business being wide.
 * The plate now says a **sentence with a verb in it**, and data-ink is a
 * discipline about ink per unit of information rather than absolute size, so
 * widening to hold a sentence is not an inversion. This plate also exists **only
 * on the selected node**, the thing the user just summoned, so taking space is
 * correct. What stays forbidden is **empty width**: a zone that draws nothing,
 * like the pill's 14px leading glyph zone, does not come back (the width formula
 * below has no such zone).
 */
export function clusterBarRect(
  parentScreenX: number,
  parentScreenY: number,
  nodeScreenRadius: number,
  label: string,
  scale: number = 1,
): ClusterChipRect {
  const w = (estimateCanvasTextWidth(label, BAR_FONT_SIZE) + BAR_PAD_X * 2) * scale;
  const h = CLUSTER_BAR_HEIGHT * scale;
  // The plate's **bottom edge** floats `BAR_NODE_LIFT` above the node's head.
  const bottom = parentScreenY - nodeScreenRadius - BAR_NODE_LIFT;
  return { x: parentScreenX - w / 2, y: bottom - h, w, h };
}

export interface ClusterBarDrawInput {
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

/**
 * Draw one bar — an opaque plate plus a **text button with a verb in it**.
 *
 * **The plate being opaque is the point.** This control is meant to overlap
 * nodes (it does not search for a spot), and anything translucent lets edges and
 * numerals bleed between the letters. What it covers comes back on collapse; a
 * button you cannot read does not.
 */
export function drawClusterBar(
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

  // Plate — a tighter radius than the fully-round pill, so "searches for a spot"
  // and "docked to a node" are told apart by silhouette.
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 7 * scale);
  ctx.fillStyle = input.hovered ? colors.hoverSurface : colors.surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = input.hovered ? colors.hoverBorder : colors.border;
  ctx.stroke();

  // Text is centred in the plate **without measuring** — `clusterBarRect` is the
  // only ruler, and measuring again here would make it two.
  ctx.font = `${FONT_WEIGHT.strong} ${BAR_FONT_SIZE * scale}px ${BAR_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = input.hovered ? colors.hoverInk : colors.barInk ?? colors.numeralInk;
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/* ── Which form to draw — one decision shared by draw, hit, reservation ───── */

/** What form a parent's expand control takes this frame. */
export type ClusterControlForm = "pill" | "bar" | "badge" | "none";

export interface ClusterControlInput {
  /** The 「Expand → Reveal control」 (expand → reveal control) setting. */
  affordance: ExpandAffordance;
  /** Is this parent currently expanded. */
  expanded: boolean;
  /**
   * Is this parent the **selected node**. The `bar` affordance exists only then
     — owner: *"Nothing at all until you select one."*
     * A collapsed parent's count is already engraved on the node itself, so a
     * permanently visible control would put the same fact on screen twice.
     */
  focused: boolean;
  /**
   * Can this chip **dock to a node** — do we know the parent's screen position.
   *
   * Normally yes, but one case structurally cannot: the batch-reveal `+N more`
   * chip has a synthetic parent id (`clusterMoreChipId`) that is not a node in
   * the graph. So under a docked form (bar or badge) that chip was **neither
   * drawn nor clickable** — measured 2026-08-02; batch reveal had been an
   * entirely unreachable feature since #826 made the bar the default affordance.
   * What cannot dock does not disappear: it **stays in the non-docking form
   * (pill)**. Omitted means `true` (dockable).
   */
  dockable?: boolean;
}

/**
 * Affordance + state → the form to draw this frame. **Draw, hit-testing, and
 * label reservation all read this one function** — when the three diverge you
 * get a button you can see but not press, or a label dodging an empty spot
 * (defects the chip has already shipped twice).
 *
 * - `pill` — collapsed = floating pill, expanded = shoulder badge.
 * - `badge` — shoulder badge in **both** states; it rides the node, so there is
 *   never a spot to search for.
 * - `bar` — **directly above** the selected node, absent when nothing is selected.
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
/** Badge mono font base size (px). */
const BADGE_FONT_SIZE = 11;
/** Approximate badge mono advance width (px) — deterministic so hit and draw agree. */
const BADGE_CHAR_WIDTH = 6.6;
/** Horizontal badge text padding (px). */
const BADGE_PAD_X = 6;
/**
 * Clearance pushing the badge **outside** the parent's radius (screen px,
 * zoom-invariant). Comfortably larger than the expanded dashed aura ring
 * (frame-draw `EXPANDED_AURA_RING_OFFSET=6`), so the badge never touches the
 * aura or the node.
 */
const BADGE_NODE_CLEARANCE = 10;

/* ── One node's controls use different bearings (measured 2026-08-02) ────────
 *
 * A selected node carries two controls: this file's expand control, and the DOM
 * orbit button "Show only this" (focus on this alone, `use-topology-loop.ts`).
 * Both anchor around the node, and both **used the same bearing (upper-right,
 * 45°)**. The result was not overlap but **occlusion** — measured at 1512×982,
 * sample vault "Marketing", shoulder badge:
 *
 * - **80% (513px²)** of the 33.6×19 badge sat under the 28×28 orbit button,
 * - `document.elementFromPoint(badge centre)` returned the orbit button's
 *   `<circle>` (= the badge is **never clickable**; clicking never changes
 *   `?open=`),
 * - the only part sticking out was the last glyph of `+17`, so it **read as
 *   "7"** — a false number.
 * - The default overhead bar was not safe either: the plate's lower-right corner
 *   16.5×4.8px (80px², 5% of the plate) was caught under the same button.
 *
 * So the bearings were split — **bar = north · badge = northwest · orbit button
 * = east**. The rule holds independent of size (the contract test below sweeps
 * radii 7–40), so overlap cannot return when nodes grow or shrink. That is what
 * separates it from bumping one value until "this screen" happens to be clear.
 */
/** Distance pushing the orbit button outside the node radius (screen px). */
export const ORBIT_BUTTON_CLEARANCE = 14;
/** Orbit button diameter (px) — the DOM side's `h-7 w-7`. The contract test measures from this. */
export const ORBIT_BUTTON_SIZE = 28;

/**
 * The rectangle the orbit button occupies this frame — single source sharing the
 * **same formula** as the DOM placement (`use-topology-loop.ts`). Written twice,
 * one side moves alone and the overlap returns.
 */
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
 * Owner report: the expanded `−N` pill collided with dashes and labels. The
 * floating pill was dropped, and the expanded badge is pushed out diagonally
 * (45°) by the node radius plus clearance, on the shoulder bearing named above.
 * Attached to the node it rides the camera, which removes the overlap at its
 * source. Single source for draw and hit — both take the same rectangle from
 * here so click coordinates cannot drift. `nodeScreenRadius` is the parent's
 * base screen radius (`radiusForKind × magnitudeScale × cameraScale`).
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
  // The **left** shoulder — the right is the orbit button's bearing (see the
  // bearings note above). And **the right edge never passes the node centre**:
  // with a small node (radius 7), a wide label (`+240`) and zoom 1.5 the badge
  // crossed the centre by 1.4px and touched the orbit button again (the residual
  // case the contract test caught). When it would overflow it moves further
  // left — the bearing holds and only the width grows leftwards.
  const cx = Math.min(parentScreenX - reach * diag, parentScreenX - w / 2);
  const cy = parentScreenY - reach * diag;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Centre of the seat the badge **sits in**. Same formula as `clusterBadgeRect`'s
 * cx/cy but independent of label width, so it also works where the label is
 * unknown (the pill's travel destination).
 *
 * Why it is needed: the collapsed pill and the expanded badge are **51–147px
 * apart** (measured), and an alpha crossfade across that gap reads as one mark
 * vanishing here and another appearing there rather than as one mark moving.
 * Walking the pill to this point while it fades puts the crossfade at the
 * destination instead of over the gap.
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
 * Where the collapsed pill is drawn this frame — the anchor moved toward the
 * badge seat by `revealT`. Both directions work out, because `revealT` runs 0→1
 * on expand and 1→0 on collapse: either way it is one mark travelling home.
 *
 * Without parent coordinates (degraded) it does not move — moving without
 * knowing the destination is drift, not travel.
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

export interface ClusterBadgeDrawInput {
  parentScreenX: number;
  parentScreenY: number;
  /** Parent's base screen radius (`radiusForKind × magnitudeScale × cameraScale`). */
  nodeScreenRadius: number;
  count: number;
  hovered: boolean;
  /**
   * Expanded — decides the label's sign (`−N` / `+N`). Arrived with the
   * shoulder-badge affordance, where the badge is present while collapsed too.
   * Defaults to `true` (expanded badge, the only earlier use) so existing
   * callers are unchanged.
   */
  expanded?: boolean;
  /** Zoom factor (`clusterChipScale`). Defaults to 1. */
  scale?: number;
}

/**
 * Draw one expanded badge — a mini `−N` docked on the parent's shoulder. No
 * stacked glyphs and no connector: once expanded the children are actually
 * visible and the badge is only a collapse affordance. The caller has already
 * set `ctx.globalAlpha` to the parent's tier alpha.
 */
export function drawClusterBadge(
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

  // The badge numeral is neutral numeralFace too — no indigoBright, so the
  // focused node stays the attention winner even while focused.
  ctx.fillStyle = colors.numeralInk;
  ctx.font = `${FONT_WEIGHT.strong} ${BADGE_FONT_SIZE * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5 * scale);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/**
 * Derive the chip rectangle from its anchor (screen coordinates, chip centre) —
 * shared by draw and hit. Width = (leading glyph zone + text (chars × approx
 * width) + horizontal padding) × scale. `scale` defaults to 1.
 */
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
 * Owner report: "The +31 overlapping between nodes looks bad too." Chips are drawn **before** node labels
 * (`topology-frame-draw.ts`), and the label placer (`greedyPlaceLabels`) did not
 * know chips existed, so labels were painted straight over them. Handing the
 * placer a chip as a **reserved occupant** needs "the rectangle the chip
 * actually occupies this frame".
 *
 * This function's contract is to take the **same branches** as
 * `drawClusterChip` — null while fading out on the reveal ramp (an invisible
 * chip pushing labels away leaves a ghost gap), the shoulder badge when
 * expanded, the pill when collapsed. Divergent branches make labels dodge empty
 * space or overlap chips again, so draw and this function are always edited
 * together (`cluster-chips.test.ts` guards it).
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
    // The floating-pill affordance's expanded badge has **no** docking fallback
    // (zero-regression contract) — if it cannot dock, nothing is drawn, as
    // before. The fallback belongs to the `badge`/`bar` affordances, and there
    // `clusterControlForm` above already turned it into `pill`, so it never
    // reaches here.
    if (!dockedNow) return null;
    return clusterBadgeRect(
      input.parentScreenX as number,
      input.parentScreenY as number,
      input.nodeScreenRadius as number,
      clusterBadgeLabel(input.count, input.expanded),
      scale,
    );
  }

  // Occupancy follows the travel too — if the pill walks while its reservation
  // stays at the anchor, label avoidance **dodges empty space and not the ink.**
  const travel = clusterChipTravelPoint(input);
  return clusterChipRect(travel.x, travel.y, clusterChipLabel(input.count, false), scale);
}

export interface ClusterChipColors {
  /** Rest pill surface (neutral dim). */
  surface: string;
  /** Rest hairline border (neutral nodeStrokeDomain) — never competes with selection indigo. */
  border: string;
  /** Rest ink of the composite `＋` glyph (indigo). */
  plusInk: string;
  /** Rest ink of the count and the expanded badge (neutral numeralFace, mono tabular). */
  numeralInk: string;
  /**
   * Rest ink of the bar's text — falls back to `numeralInk`.
   *
   * Why it is separate: the pill and badge are **permanent chrome**, so the
   * bottom of the ink ramp is right for them (chrome sits below content). The
   * bar is a **summoned control** that appears only once the user selects a
   * node. With the same ink, the text of the button they just summoned would be
   * darker than the outline of a background node, and unreadable.
   */
  barInk?: string;
  /** Parent→chip tether stroke (edgeContains — offset in lightness from the depends ink). */
  tether: string;
  /** Hover pill surface (nodeFillCapability). */
  hoverSurface: string;
  /** Hover border (indigo). */
  hoverBorder: string;
  /** Hover ink for `＋` and the numeral (indigoBright). */
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
  /** Chip centre, screen coordinates. */
  screenX: number;
  screenY: number;
  count: number;
  expanded: boolean;
  hovered: boolean;
  /**
   * Hover easing progress 0..1 (colour interpolation only). The frame loop
   * builds a ~150ms ramp from `now`. Under prefers-reduced-motion it snaps to
   * hovered ? 1 : 0. Omitted, it falls back to `hovered` (0/1).
   */
  hoverT?: number;
  /**
   * Expand/collapse reveal ramp 0..1, supplied by the loop. It fades the alpha of
   * whichever form is on screen (badge = revealT, pill = 1−revealT) so the swap
   * is not an abrupt cut. Omitted means alpha 1 — backward compatible hard swap.
   */
  revealT?: number;
  /** Zoom factor (derived from the camera by `clusterChipScale`). Defaults to 1. */
  scale?: number;
  /** Parent screen coordinates — when present, a short dashed parent→chip connector is drawn. */
  parentScreenX?: number;
  parentScreenY?: number;
  /**
   * Parent's base screen radius, needed to place the shoulder badge while
   * `expanded`. With the parent coordinates and this value present, the draw
   * delegates to `drawClusterBadge` instead of the floating pill.
   */
  nodeScreenRadius?: number;
  /**
   * The "Expand → Reveal control" setting. Omitted means
     * `"pill"` — not one pixel differs from the earlier behaviour (this file's
     * zero-regression contract).
     */
  affordance?: ExpandAffordance;
  /** Is this parent the selected node — the `"bar"` affordance's precondition. Defaults to false. */
  focused?: boolean;
  /** The "How many one press opens" setting — decides "all" vs "N". */
  batchSize?: number;
  /** Bar wording (translated). The caller passes it; the renderer builds no strings. */
  barLabels?: ClusterBarLabels;
}

/**
 * Draw one chip. The caller (`topology-frame-draw.ts`) has already set
 * `ctx.globalAlpha` to the parent's tier alpha; this function only multiplies
 * into that base and restores it before returning.
 */
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
  // Under the overhead-bar affordance an unselected parent has **no** control.
  // Occupancy (`clusterChipOccupancyRect`) returns null from the same decision.
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

  // The shoulder-badge affordance is a badge in **both** states — with no pill
  // there is nothing to crossfade with; only the sign flips `+`↔`−`.
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

  // Fade the current form's alpha in on the reveal ramp; omitted means 1
  // (backward compatible). Multiplied into the baseAlpha the caller set.
  //
  // ⚠️ **Both forms are drawn while the ramp runs.** Branching on `expanded` and
  // drawing only one form meant **there was no crossfade in either direction** —
  // expanding, the pill vanished in one frame and the badge rode its ramp alone
  // (frame measurement 2026-07-31: pill's last frame α=1.000 → absent the next
  // frame, zero frames in between).
  //
  // Worse, that branch sat **before the travel code**. Expanding is
  // `expanded=true` from the first frame, so `clusterChipTravelPoint` was
  // **never reached** — the travel existed but never ran on expand.
  const baseAlpha = ctx.globalAlpha;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const badgeAlpha =
    input.revealT === undefined ? (input.expanded ? 1 : 0) : clamp01(input.revealT);
  const pillAlpha =
    input.revealT === undefined ? (input.expanded ? 0 : 1) : clamp01(1 - input.revealT);
  if (badgeAlpha < 0.01 && pillAlpha < 0.01) return;

  // The expanded form is the shoulder badge, not a floating pill — that is what
  // removes the dashed-aura and label overlap at its source. Seating the badge
  // needs the parent coordinates and the node radius; without them (degraded)
  // nothing is drawn.
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
    ctx.globalAlpha = baseAlpha; // restore the reveal alpha.
    return;
  }
  ctx.globalAlpha = baseAlpha * pillAlpha;

  // The departing (or arriving) pill is **always the collapsed form** — `+N`.
  // Passing `input.expanded` straight to the label would make the pill read
  // `− N` during an expand ramp, so what leaves and what arrives would say the
  // same thing.
  const label = clusterChipLabel(input.count, false);
  // While fading, the pill **walks** to the badge seat (see
  // `clusterChipTravelPoint`). At rest (revealT 0 or omitted) it stays on the
  // anchor, not one pixel from the earlier coordinates.
  const travel = clusterChipTravelPoint(input);
  const rect = clusterChipRect(travel.x, travel.y, label, scale);

  // Hover easing — colour interpolation only (transition-colors in character),
  // quiet neutral at rest waking to indigo on hover. No transform, no zoom step,
  // no glow. RGB lerp between hex tokens.
  const t = input.hoverT ?? (input.hovered ? 1 : 0);
  const mix = (rest: string, hover: string): string =>
    t <= 0 ? rest : t >= 1 ? hover : lerpColorHex(rest, hover, t);
  const surface = mix(colors.surface, colors.hoverSurface);
  const border = mix(colors.border, colors.hoverBorder);
  const plusColor = mix(colors.plusInk, colors.hoverInk);
  const numColor = mix(colors.numeralInk, colors.hoverInk);

  // Parent→chip tether — a different texture from the depends dashes (dash
  // [3,3]; strokeStyle edgeContains offsets it in lightness from the depends
  // ink) so it does not join the 'edge soup'. A 2px indigo dot at the parent end
  // pins the membership. The pill is filled afterwards, so the tether's segment
  // inside the pill is naturally covered.
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
    // Anchor dot at the parent end — pins where the tether starts.
    ctx.beginPath();
    ctx.arc(input.parentScreenX, input.parentScreenY, 2 * scale, 0, Math.PI * 2);
    ctx.fillStyle = colors.plusInk;
    ctx.fill();
    ctx.restore();
  }

  // pill
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = input.hovered ? 1.5 : 1;
  ctx.strokeStyle = border;
  ctx.stroke();

  // Composite `＋N` plus disclosure caret — one cluster centred in the pill.
  // `＋` indigo, numeral neutral numeralFace (mono tabular), caret in the border
  // ink carrying only the "open N" affordance. The hit box comes from the rect
  // above, so the text is free to centre itself.
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
  ctx.globalAlpha = baseAlpha; // restore the reveal formAlpha.
}
