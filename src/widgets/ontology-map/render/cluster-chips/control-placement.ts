/**
 * What a chip, badge or bar says, which form a parent takes, and where it sits on screen. Draw,
 * hit-testing and label reservation all read these, so none of this touches a canvas.
 */

import type { ExpandAffordance } from "@/shared/lib/preferences/expand-preferences";
import { estimateCanvasTextWidth } from "./text-width";

/** Chip base height (px, screen space — multiplied by `clusterChipScale`). */
export const CLUSTER_CHIP_HEIGHT = 28;
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
export const BAR_FONT_SIZE = 12;
const BAR_PAD_X = 10;

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
