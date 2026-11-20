import type { LibraryGraphEdge, LibraryGraphRelation } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";
import type { LibraryGraphFrame } from "./draw-library-graph";
import { CITES_WIDTH, nodeCentre } from "./library-graph-marks";

/** The lines between marks. Only an edge whose ink can reach the canvas is drawn. */

/**
 * A mention or an "about" link: the page names the concept, or says it is about it. The two
 * share a width and differ by dash, so solid alone says "about"; both end on a ring, never a
 * square, so neither reads as a citation.
 */
const CONCEPT_LINE_WIDTH = 1;

/** Fixed line weight, which keeps the 5.23:1 contrast those widths were measured at true everywhere. */
export function libraryEdgeWidth(relation: LibraryGraphRelation): number {
  return relation === "cites" ? CITES_WIDTH : CONCEPT_LINE_WIDTH;
}

/** The break an unverified citation carries at its midpoint, in CSS px. */
const BROKEN_EDGE_GAP = 7;

/**
 * The flowing dash in CSS px. Dashed already means `mentions`, so only the open card's own
 * citations flow, or two relations share one mark.
 */
const FLOW_DASH = 5;
const FLOW_GAP = 4;
const FLOW_PERIOD = FLOW_DASH + FLOW_GAP;
/** Where a still frame's chevron sits along the curve, and how wide its arms are. */
const FLOW_CHEVRON_T = 0.62;
const FLOW_CHEVRON_PX = 3.5;
/**
 * The amber dot in a broken citation's gap: rest radius, floor (the 3px mark floor, since
 * the dot alone says "unverified") and breath; never past half its break.
 */
const STALE_DOT_RADIUS = 2.2;
const STALE_DOT_RADIUS_MIN = 1.5;
const STALE_DOT_BREATH = 1.1;
/**
 * Most standing amber dots at rest, counted in unverified citations, keeping amber under 4% of ink;
 * 64 sits between the densest legible fixture (48) and what its ink affords (72). Above it no dot
 * stands, never a sample, so an undotted stale citation never reads as fresh.
 */
export const STALE_DOT_STANDING_MAX = 64;

/**
 * Bow depth as a fraction of edge length, capped: long parallel edges separate while a short
 * one stays nearly straight and never suggests a path through somewhere else.
 */
const EDGE_BOW_RATIO = 0.11;
const EDGE_BOW_MAX = 17;

/**
 * Where an unverified citation breaks in the flow picture, as a fraction from the page.
 * Just short of the page, where lines converge, it reads as a stale page; further out the
 * breaks line up into a column of amber.
 */
const FLOW_BREAK_T = 0.12;

/**
 * How far past its curve's hull an edge can paint: a chevron's arm plus a selected citation's
 * full width, which covers the arm's miter tip (6.0 px) and the breathing stale dot (3.3 px).
 */
const EDGE_INK_REACH_PX = FLOW_CHEVRON_PX * Math.SQRT2 + CITES_WIDTH * 1.5;

/**
 * A flow edge's two control points: level tangents at both ends, so a bundle of citations
 * reads as a sheaf.
 */
function flowEdgeControls(from: LayoutPoint, to: LayoutPoint): [LayoutPoint, LayoutPoint] {
  const reach = Math.abs(to.x - from.x) * 0.5;
  const sign = to.x >= from.x ? 1 : -1;
  return [
    { x: from.x + sign * reach, y: from.y },
    { x: to.x - sign * reach, y: to.y },
  ];
}

/** One point on the cubic, for the break in an unverified citation. */
function cubicAt(from: LayoutPoint, c1: LayoutPoint, c2: LayoutPoint, to: LayoutPoint, t: number): LayoutPoint {
  const u = 1 - t;
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
  };
}

/** The quadratic control point of an edge's bow, always on the same side for one consistent hand. */
export function edgeControlPoint(from: LayoutPoint, to: LayoutPoint): LayoutPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { x: from.x, y: from.y };
  const bow = Math.min(EDGE_BOW_MAX, length * EDGE_BOW_RATIO);
  return {
    x: (from.x + to.x) / 2 - (dy / length) * bow,
    y: (from.y + to.y) / 2 + (dx / length) * bow,
  };
}

/** One point on the quadratic, for the break in an unverified citation. */
function quadraticAt(from: LayoutPoint, control: LayoutPoint, to: LayoutPoint, t: number): LayoutPoint {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

function lerp(a: LayoutPoint, b: LayoutPoint, t: number): LayoutPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Whether any of the edge's ink can land on the canvas. A Bézier curve stays inside the hull of
 * its points, so a box around them grown by {@link EDGE_INK_REACH_PX} never drops a line that
 * crosses the screen; NaN ends are kept, as an unculled frame draws them.
 */
function edgeMeetsView(frame: LibraryGraphFrame, from: LayoutPoint, to: LayoutPoint): boolean {
  let reach = EDGE_INK_REACH_PX;
  // A flow cubic's controls sit between its ends; a bow's lies `bow` off the chord's midpoint.
  if (frame.layout !== "flow") reach += Math.min(EDGE_BOW_MAX, Math.hypot(to.x - from.x, to.y - from.y) * EDGE_BOW_RATIO);
  const left = Math.min(from.x, to.x) - reach;
  const right = Math.max(from.x, to.x) + reach;
  const top = Math.min(from.y, to.y) - reach;
  const bottom = Math.max(from.y, to.y) + reach;
  return !(right < 0 || left > frame.width || bottom < 0 || top > frame.height);
}

/** Indices into `frame.edges` of the edges this frame draws, pooled across frames. */
let drawnEdges = new Int32Array(1024);

/** Fills {@link drawnEdges}, O(edges); returns how many edges this frame draws. */
function collectDrawnEdges(frame: LibraryGraphFrame, active: string | null): number {
  const focus = frame.focus ?? null;
  let count = 0;
  for (let index = 0; index < frame.edges.length; index += 1) {
    const edge = frame.edges[index];
    if (frame.focusEdgesOnly) {
      const touchesSelection =
        frame.selectedId !== null && (edge.source === frame.selectedId || edge.target === frame.selectedId);
      const touchesActive = active !== null && (edge.source === active || edge.target === active);
      // The overview draws no line at rest, or ten thousand citations become a grey field.
      if (!touchesSelection && !touchesActive && !(focus?.has(edge.source) && focus?.has(edge.target))) continue;
    }
    const from = nodeCentre(frame, edge.source);
    const to = nodeCentre(frame, edge.target);
    if (!from || !to || !edgeMeetsView(frame, from, to)) continue;
    if (count === drawnEdges.length) {
      const grown = new Int32Array(drawnEdges.length * 2);
      grown.set(drawnEdges);
      drawnEdges = grown;
    }
    drawnEdges[count] = index;
    count += 1;
  }
  return count;
}

/** Edges before marks, so no line crosses the mark it points at. */
export function drawLibraryEdges(
  ctx: CanvasRenderingContext2D,
  frame: LibraryGraphFrame,
  alphaOf: (id: string) => number,
): void {
  const { ink } = frame;
  const focus = frame.focus ?? null;
  const active = frame.hoveredId ?? frame.focusedId;
  const flow = frame.flow ?? null;
  // The quiet overview draws no line at all: nothing selected, pointed at or focused.
  const noLine = frame.focusEdgesOnly === true && frame.selectedId === null && active === null && (focus?.size ?? 0) === 0;
  const drawn = noLine ? 0 : collectDrawnEdges(frame, active);
  for (let k = 0; k < drawn; k += 1) {
    const edge = frame.edges[drawnEdges[k]];
    const from = nodeCentre(frame, edge.source)!;
    const to = nodeCentre(frame, edge.target)!;
    const touchesSelection =
      frame.selectedId !== null && (edge.source === frame.selectedId || edge.target === frame.selectedId);
    // Pointing at a dot asks about its links, which answer well above the 3:1 floor.
    const touchesActive = active !== null && (edge.source === active || edge.target === active);
    /*
     * An open card's citations drift; a just-written page's run one pass. The path is
     * stroked page→file, so a rising `lineDashOffset` moves the ink toward the page.
     */
    const drifting = flow !== null && !flow.still && flow.edges.has(edge.id);
    const arriving = flow !== null && !flow.still && flow.arrivalEdges.has(edge.id);
    // As present as its dimmer end, except the selected page's own lines ("where I am").
    ctx.globalAlpha = touchesSelection ? 1 : Math.min(alphaOf(edge.source), alphaOf(edge.target));
    ctx.beginPath();
    if (drifting || arriving) {
      ctx.setLineDash([FLOW_DASH, FLOW_GAP]);
      ctx.lineDashOffset = (drifting ? flow!.phase : flow!.arrivalPhase) * FLOW_PERIOD;
    } else {
      ctx.setLineDash(edge.relation === "mentions" ? [2.5, 3.5] : []);
      ctx.lineDashOffset = 0;
    }
    ctx.strokeStyle = touchesSelection
      ? ink.selected
      : touchesActive
        ? ink.source
        : arriving
          ? ink.selected
          : ink.edge;
    // The relations differ in width as well as dash; value stays reserved for the selection.
    const relationWidth = libraryEdgeWidth(edge.relation);
    ctx.lineWidth = relationWidth * (touchesSelection ? 1.5 : touchesActive ? 1.33 : 1);
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const half = Math.min(BROKEN_EDGE_GAP, length / 3) / 2 / length;
    if (frame.layout === "flow") {
      const [c1, c2] = flowEdgeControls(from, to);
      if (edge.certainty === "unverified") {
        // Two pieces of the curve with a gap at FLOW_BREAK_T.
        const steps = 12;
        ctx.moveTo(from.x, from.y);
        for (let i = 1; i <= steps; i += 1) {
          const t = (FLOW_BREAK_T - half) * (i / steps);
          const point = cubicAt(from, c1, c2, to, t);
          ctx.lineTo(point.x, point.y);
        }
        const resume = cubicAt(from, c1, c2, to, FLOW_BREAK_T + half);
        ctx.moveTo(resume.x, resume.y);
        for (let i = 1; i <= steps; i += 1) {
          const t = FLOW_BREAK_T + half + (1 - FLOW_BREAK_T - half) * (i / steps);
          const point = cubicAt(from, c1, c2, to, t);
          ctx.lineTo(point.x, point.y);
        }
      } else {
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
      }
      ctx.stroke();
      continue;
    }
    const control = edgeControlPoint(from, to);
    if (edge.certainty === "unverified") {
      /*
       * One break at the midpoint, so "unverified" is a different mark, not a shade. Each
       * half is the original curve by de Casteljau's split, so the break keeps its shape.
       */
      const first = 0.5 - half;
      const second = 0.5 + half;
      // Splitting a quadratic at t gives (P0, A, M) before it and (M, B, P1) after it,
      // where A and B are the two edges of the control triangle at t and M is the point on
      // the curve. Each piece is drawn from its own split.
      const beforeControl = lerp(from, control, first);
      const beforeEnd = quadraticAt(from, control, to, first);
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(beforeControl.x, beforeControl.y, beforeEnd.x, beforeEnd.y);
      const afterControl = lerp(control, to, second);
      const afterStart = quadraticAt(from, control, to, second);
      ctx.moveTo(afterStart.x, afterStart.y);
      ctx.quadraticCurveTo(afterControl.x, afterControl.y, to.x, to.y);
    } else {
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
    }
    ctx.stroke();

    // Under reduced motion one open chevron on the curve, pointing at the page, keeps the direction.
    if (flow !== null && flow.still && (flow.edges.has(edge.id) || flow.arrivalEdges.has(edge.id))) {
      const at = quadraticAt(from, control, to, FLOW_CHEVRON_T);
      const behind = quadraticAt(from, control, to, FLOW_CHEVRON_T - 0.06);
      const dx = behind.x - at.x;
      const dy = behind.y - at.y;
      const chevronLength = Math.hypot(dx, dy) || 1;
      const ux = dx / chevronLength;
      const uy = dy / chevronLength;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(at.x + (-ux * FLOW_CHEVRON_PX - uy * FLOW_CHEVRON_PX), at.y + (-uy * FLOW_CHEVRON_PX + ux * FLOW_CHEVRON_PX));
      ctx.lineTo(at.x + ux * FLOW_CHEVRON_PX, at.y + uy * FLOW_CHEVRON_PX);
      ctx.lineTo(at.x + (-ux * FLOW_CHEVRON_PX + uy * FLOW_CHEVRON_PX), at.y + (-uy * FLOW_CHEVRON_PX - ux * FLOW_CHEVRON_PX));
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
}

/**
 * The amber dot fills the broken citation's gap, so it reads as about the break. It stands
 * whenever the line is drawn, or the card's "amber dot" sentence names a mark the resting
 * canvas never draws; `pulse` only grows it. The breath is size, never alpha: a translucent
 * dot composites off the warning amber and fails the gate's scan.
 */
export function drawStaleDots(
  ctx: CanvasRenderingContext2D,
  frame: LibraryGraphFrame,
  alphaOf: (id: string) => number,
): void {
  const flow = frame.flow ?? null;
  const focus = frame.focus ?? null;
  const dim = frame.dim ?? 0;
  const active = frame.hoveredId ?? frame.focusedId;
  const breath = flow === null ? 0 : flow.still ? 1 : flow.pulsePhase;
  /*
   * Above {@link STALE_DOT_STANDING_MAX} only citations in hand keep their dots: count is
   * the only lever with range, since alpha fails the amber scan and radius has one step left.
   * An open card's mark is the selection and in `focus`, so the card's `flowInlineStale`
   * sentence still names a drawn mark.
   */
  let standing = 0;
  for (const edge of frame.edges) if (edge.certainty === "unverified") standing += 1;
  const everyDot = standing <= STALE_DOT_STANDING_MAX;
  /**
   * How far a dot is revealed: 1, 0, or the dim ramp's value. Only the reader's attention
   * counts; exempting `flow.pulse` or `flow.arrivalEdges` repaints the whole stale field on
   * every visit. It rides `dim` because `focus` outlives the un-dim ramp, or the dots
   * never go away.
   */
  const revealOf = (edge: LibraryGraphEdge): number => {
    if (everyDot) return 1;
    const inHand =
      (focus !== null && (focus.has(edge.source) || focus.has(edge.target))) ||
      edge.source === frame.selectedId ||
      edge.target === frame.selectedId ||
      (active !== null && (edge.source === active || edge.target === active));
    return inHand ? dim : 0;
  };
  for (const edge of frame.edges) {
    if (edge.certainty !== "unverified") continue;
    const reveal = revealOf(edge);
    if (reveal <= 0) continue;
    const from = nodeCentre(frame, edge.source);
    const to = nodeCentre(frame, edge.target);
    if (!from || !to || !edgeMeetsView(frame, from, to)) continue;
    const pulsing = flow !== null && flow.pulse.has(edge.id);
    const rise = pulsing ? breath : 0;
    const middle =
      frame.layout === "flow"
        ? (() => {
            const [c1, c2] = flowEdgeControls(from, to);
            return cubicAt(from, c1, c2, to, FLOW_BREAK_T);
          })()
        : quadraticAt(from, edgeControlPoint(from, to), to, 0.5);
    const gap = Math.min(BROKEN_EDGE_GAP, Math.hypot(to.x - from.x, to.y - from.y) / 3);
    const radius =
      Math.max(STALE_DOT_RADIUS_MIN, Math.min(STALE_DOT_RADIUS, gap / 2)) + STALE_DOT_BREATH * rise;
    // The line's own alpha: a dimmed citation's dot dims with it; the selected page's stays full.
    const edgeAlpha =
      frame.selectedId !== null && (edge.source === frame.selectedId || edge.target === frame.selectedId)
        ? 1
        : Math.min(alphaOf(edge.source), alphaOf(edge.target));
    ctx.globalAlpha = edgeAlpha * reveal;
    ctx.fillStyle = frame.ink.stale;
    ctx.beginPath();
    ctx.arc(middle.x, middle.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
