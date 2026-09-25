import { EGO_BEARINGS, type ConceptEgo, type EgoBearing } from "../model/build-concept-ego";

/**
 * Where every mark of a concept's ego drawing sits, computed without a DOM.
 *
 * The drawing used to place each neighbour's label on a fixed side of its node
 * (right, left, or centred for near-vertical slots) and never looked at the labels
 * already placed. Measured 2026-09-25 at 1512x949: two neighbours on adjacent slots
 * drew the labels "Issue invoice" and "Payment gateway adapter" through each other (a 33x19px
 * overlap). A label nobody can read is not a label, so every label now tries the
 * four sides of its node in order and takes the first that collides with nothing
 * already on the drawing, falling back to the least-overlapping side.
 *
 * Pure so the placement can be tested: `ego-layout.test.ts` asserts that no two
 * labels intersect for dense egos.
 */

export const EGO_VIEW_W = 660;
export const EGO_VIEW_H = 345;

/** The box the drawing is laid out in, in CSS pixels; the default is the pre-measure view. */
export type EgoView = { w: number; h: number };
export const DEFAULT_EGO_VIEW: EgoView = { w: EGO_VIEW_W, h: EGO_VIEW_H };

/** Room kept outside the outermost ring for a side label (about 12 Latin characters at 11px). */
const EGO_LABEL_ROOM_X = 84;
/** Room kept above and below the outermost ring for a label drawn over or under its node. */
const EGO_LABEL_ROOM_Y = 30;
/** How far the rings may stretch or shrink to meet the box, per axis. */
const EGO_FILL_MAX = 1.9;
const EGO_FILL_MIN = 0.4;

/** Neighbours visible in one fan. Beyond it, an "and N more" pill. */
const EGO_FAN_CAP = 7;

export type EgoGeometry = {
  self: Record<string, number>;
  neighbor: Record<string, number>;
  ringMin: number;
  ringMax: number;
  ex: number;
  ey: number;
};

/** The token values from `app/globals.css` (`--git-ego-*`); the component reads the live ones. */
export const DEFAULT_EGO_GEOMETRY: EgoGeometry = {
  self: { project: 25, domain: 21, capability: 16, element: 13.5 },
  neighbor: { project: 14, domain: 12, capability: 9.5, element: 8 },
  ringMin: 74,
  ringMax: 126,
  ex: 1.52,
  ey: 0.8,
};

export type Rect = { x: number; y: number; w: number; h: number };
type Side = "right" | "left" | "below" | "above";

interface EgoLabel {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "end" | "middle";
  rect: Rect;
}

type EgoSlot =
  | {
      type: "node";
      bearing: EgoBearing;
      index: number;
      id: string;
      fullLabel: string;
      kind: string;
      x: number;
      y: number;
      r: number;
      dashed: boolean;
      label: EgoLabel;
    }
  | {
      type: "more";
      bearing: EgoBearing;
      index: number;
      rest: number;
      x: number;
      y: number;
      width: number;
      dashed: boolean;
    };

export interface EgoLayout {
  cx: number;
  cy: number;
  selfRadius: number;
  selfLabel: EgoLabel;
  slots: EgoSlot[];
}

const DASHED: readonly EgoBearing[] = ["dependsOn", "usedBy"];

/** Label line box at the `text-label` step (11px) in view units. */
const LABEL_H = 14;
/** Air between a node's edge and its label. */
const LABEL_GAP = 6;

function radiusOf(map: Record<string, number>, kind: string): number {
  return map[kind] ?? map.element;
}

/** More neighbours means more labels — truncate in step with density. */
function labelCap(slots: number): number {
  if (slots > 12) return 9;
  if (slots > 8) return 12;
  return 16;
}

function truncate(label: string, cap: number): string {
  return label.length > cap ? `${label.slice(0, cap - 1)}…` : label;
}

/**
 * A conservative width estimate at 11px. Hangul and CJK glyphs are near square;
 * Latin is about half that. Overestimating only costs air, underestimating
 * reintroduces the overlap, so the numbers lean wide.
 */
function estimateLabelWidth(text: string, fontSize = 11): number {
  let width = 0;
  for (const ch of text) {
    if (/[ᄀ-ᇿ㄰-㆏가-힯぀-ヿ一-鿿]/.test(ch)) width += fontSize * 1.02;
    else if (ch === " ") width += fontSize * 0.3;
    else if (/[A-Z0-9mwMW@#%&]/.test(ch)) width += fontSize * 0.66;
    else width += fontSize * 0.56;
  }
  return Math.ceil(width);
}

function labelAt(side: Side, x: number, y: number, r: number, text: string): EgoLabel {
  const w = estimateLabelWidth(text);
  switch (side) {
    case "right":
      return { text, x: x + r + LABEL_GAP, y: y + 4, anchor: "start", rect: { x: x + r + LABEL_GAP, y: y - LABEL_H / 2, w, h: LABEL_H } };
    case "left":
      return { text, x: x - r - LABEL_GAP, y: y + 4, anchor: "end", rect: { x: x - r - LABEL_GAP - w, y: y - LABEL_H / 2, w, h: LABEL_H } };
    case "below":
      return { text, x, y: y + r + 3 + 11, anchor: "middle", rect: { x: x - w / 2, y: y + r + 3, w, h: LABEL_H } };
    case "above":
      return { text, x, y: y - r - 3 - 3, anchor: "middle", rect: { x: x - w / 2, y: y - r - 3 - LABEL_H, w, h: LABEL_H } };
  }
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function outOfBounds(rect: Rect, view: EgoView): number {
  const inside = overlapArea(rect, { x: 0, y: 0, w: view.w, h: view.h });
  return rect.w * rect.h - inside;
}

/**
 * A label that crosses the box's side edge by less than the node gap is slid back inside.
 * In a narrow cell (1280, beside the reading table) the best of the four sides can still
 * lean a fraction of a pixel past the edge, where the SVG would clip its last glyph.
 */
function nudgeInside(label: EgoLabel, view: EgoView): EgoLabel {
  const over = label.rect.x + label.rect.w - view.w;
  const under = -label.rect.x;
  const shift = over > 0 && over <= LABEL_GAP ? -over : under > 0 && under <= LABEL_GAP ? under : 0;
  if (shift === 0) return label;
  return { ...label, x: label.x + shift, rect: { ...label.rect, x: label.rect.x + shift } };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return overlapArea(a, b) > 0;
}

function circleBox(x: number, y: number, r: number): Rect {
  return { x: x - r, y: y - r, w: r * 2, h: r * 2 };
}

/** The sides a label tries, most natural first: outward from the centre, then the rest. */
function sidesFor(cos: number, sin: number): Side[] {
  if (cos > 0.04) return sin > 0 ? ["right", "below", "above", "left"] : ["right", "above", "below", "left"];
  if (cos < -0.04) return sin > 0 ? ["left", "below", "above", "right"] : ["left", "above", "below", "right"];
  return sin > 0 ? ["below", "right", "left", "above"] : ["above", "right", "left", "below"];
}

export function layoutConceptEgo(
  ego: ConceptEgo,
  geometry: EgoGeometry = DEFAULT_EGO_GEOMETRY,
  view: EgoView = DEFAULT_EGO_VIEW,
  /**
   * The words an "and N more" pill carries. The pill used to be sized for its digits alone
   * (26px plus 6 per digit), so "and 1 more" ran out of both ends of a 32px pill (round four).
   */
  moreText?: (rest: number) => string,
): EgoLayout | null {
  const groups = EGO_BEARINGS.map((bearing) => {
    const all = ego.neighbors[bearing];
    const shown = all.slice(0, EGO_FAN_CAP);
    return {
      bearing,
      all,
      shown,
      rest: all.length - shown.length,
      slots: shown.length + (all.length > shown.length ? 1 : 0),
    };
  }).filter((g) => g.all.length > 0);

  if (groups.length === 0) return null;

  const slotTotal = groups.reduce((sum, g) => sum + g.slots, 0);
  const maxSlots = Math.max(...groups.map((g) => g.slots), 1);
  /*
   * Fixed bearings leave three quarters of the frame empty for a concept whose
   * neighbours are all one kind (measured: contains 17, everything else 0). So
   * the circle is **divided by share** — each relation gets a fan proportional
   * to its own count and the fans sum to the full circle. The order is fixed,
   * so switching concepts never shifts a direction.
   */
  const gap = groups.length > 1 ? 10 : 0;
  const usable = 360 - gap * groups.length;
  const ring = Math.max(geometry.ringMin, Math.min(geometry.ringMax, 58 + (slotTotal <= 2 ? 26 : 0) + maxSlots * 11));
  const stagger = slotTotal > 12 ? 36 : slotTotal > 4 ? 22 : 0;
  const cx = view.w / 2;
  const cy = view.h / 2;
  const selfRadius = radiusOf(geometry.self, ego.kind);
  /*
   * **The drawing fills the box it is given** (round three, 2026-09-25). The fan was sized
   * for a fixed 660x345 view and the SVG was scaled to fit its cell, so at 1512 the
   * drawing used about 40% of its box and every 11px label was scaled down to 9-10px. Now
   * the view is the cell's own pixel size, labels are drawn 1:1, and the rings stretch
   * on each axis until the outermost node, plus room for its label, meets the box's edge.
   * The stretch is capped so a two-neighbour concept does not draw spokes across a
   * 1920 screen, and floored so a narrow cell still keeps its labels apart.
   */
  const outer = ring + stagger + (groups.some((g) => g.rest > 0) ? 34 : 0);
  const fit = (room: number, reach: number) =>
    Math.min(EGO_FILL_MAX, Math.max(EGO_FILL_MIN, room / Math.max(1, reach)));
  const sx = fit(view.w / 2 - EGO_LABEL_ROOM_X, outer * geometry.ex);
  const sy = fit(view.h / 2 - EGO_LABEL_ROOM_Y, outer * geometry.ey);

  type Pending = { slot: Omit<Extract<EgoSlot, { type: "node" }>, "label">; text: string; cos: number; sin: number };
  const nodes: Pending[] = [];
  const slots: EgoSlot[] = [];
  const obstacles: Rect[] = [circleBox(cx, cy, selfRadius + 6)];

  let cursor = -90 - ((groups[0].slots / slotTotal) * usable + gap) / 2;
  for (const group of groups) {
    const span = (group.slots / slotTotal) * usable;
    const cap = labelCap(group.slots);
    /*
     * When a fan spans the **whole circle** (only one relation kind), its two
     * ends are the same angle. Dividing by `i/(slots-1)` puts the first and last
     * slot at exactly the same place, so one neighbour hides under another — the
     * screen said "contains 3" and drew two (measured 2026-08-02). A closed
     * circle divides by `slots`.
     */
    const closed = groups.length === 1;
    for (let i = 0; i < group.slots; i += 1) {
      const ratio = group.slots === 1 ? 0.5 : closed ? i / group.slots : i / (group.slots - 1);
      const angle = ((cursor + gap / 2 + (group.slots === 1 ? span / 2 : span * ratio)) * Math.PI) / 180;
      const isMore = group.rest > 0 && i === group.slots - 1;
      const radius = ring + (i % 2) * stagger + (isMore ? 34 : 0);
      const x = cx + radius * Math.cos(angle) * geometry.ex * sx;
      const y = cy + radius * Math.sin(angle) * geometry.ey * sy;
      const dashed = DASHED.includes(group.bearing);
      if (isMore) {
        const width = moreText
          ? estimateLabelWidth(moreText(group.rest), 10) + 16
          : 26 + String(group.rest).length * 6;
        slots.push({ type: "more", bearing: group.bearing, index: i, rest: group.rest, x, y, width, dashed });
        obstacles.push({ x: x - width / 2, y: y - 9, w: width, h: 18 });
        continue;
      }
      const neighbor = group.shown[i];
      const r = radiusOf(geometry.neighbor, neighbor.kind);
      obstacles.push(circleBox(x, y, r));
      nodes.push({
        slot: { type: "node", bearing: group.bearing, index: i, id: neighbor.id, fullLabel: neighbor.label, kind: neighbor.kind, x, y, r, dashed },
        text: truncate(neighbor.label, cap),
        cos: Math.cos(angle),
        sin: Math.sin(angle),
      });
    }
    cursor += span + gap;
  }

  // The centre's own name is drawn at `text-body-lg` (14px) with its baseline 18 below the node.
  const selfText = truncate(ego.label, 22);
  const selfWidth = estimateLabelWidth(selfText, 14);
  const selfLabel: EgoLabel = {
    text: selfText,
    x: cx,
    y: cy + selfRadius + 18,
    anchor: "middle",
    rect: { x: cx - selfWidth / 2, y: cy + selfRadius + 4, w: selfWidth, h: 18 },
  };
  const placed: Rect[] = [selfLabel.rect];

  const placedNodes = new Map<string, EgoLabel>();
  for (const node of nodes) {
    const { x, y, r } = node.slot;
    const own = circleBox(x, y, r);
    let best: EgoLabel | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    // A shorter text is the last resort: the full title stays on the node's `<title>`.
    const texts = [node.text, truncate(node.text.replace(/…$/, ""), Math.max(5, Math.floor(node.text.length * 0.6)))];
    for (const text of texts) {
      for (const side of sidesFor(node.cos, node.sin)) {
        const candidate = labelAt(side, x, y, r, text);
        let cost = outOfBounds(candidate.rect, view) * 2;
        for (const rect of placed) cost += overlapArea(candidate.rect, rect) * 4;
        for (const rect of obstacles) if (rect !== own) cost += overlapArea(candidate.rect, rect);
        if (cost < bestCost) {
          best = candidate;
          bestCost = cost;
        }
        if (cost === 0) break;
      }
      if (bestCost === 0) break;
    }
    const label = nudgeInside(best ?? labelAt(sidesFor(node.cos, node.sin)[0], x, y, r, node.text), view);
    placed.push(label.rect);
    placedNodes.set(`${node.slot.bearing}:${node.slot.index}`, label);
  }

  for (const node of nodes) {
    slots.push({ ...node.slot, label: placedNodes.get(`${node.slot.bearing}:${node.slot.index}`)! });
  }
  slots.sort((a, b) => EGO_BEARINGS.indexOf(a.bearing) - EGO_BEARINGS.indexOf(b.bearing) || a.index - b.index);

  return { cx, cy, selfRadius, selfLabel, slots };
}
