import type { LibraryGraphEdge, LibraryGraphNode, LibraryGraphNodeKind } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";
import type { LibraryGraphInk } from "./library-graph-ink";

/**
 * One frame of the library graph. **No React, no DOM, no clock** — the caller owns the
 * canvas, the time and the state; this function only paints what it is handed, which is
 * what makes every rule below testable without a browser.
 *
 * ## What the marks encode
 *
 * | Node | Mark | Why that mark |
 * |---|---|---|
 * | page | filled circle, the brightest neutral | the thing this screen is for: what somebody wrote |
 * | source | filled square | a file, not a thought — the one mark here that is not round |
 * | concept | ring, unfilled | it lives on the map, not in this folder; hollow says "elsewhere" |
 *
 * | Edge | Mark |
 * |---|---|
 * | cites, hash still matching | solid, 1.5px |
 * | mentions | dashed, 1px |
 * | either, unverified | broken once at its midpoint |
 *
 * A source nobody has written up is a **hollow** square: the state the list beside this
 * canvas prints as "not compiled" gets a mark of its own rather than being inferred from
 * the absence of a 1.4:1 hairline (design-infoviz, 2026-09-06).
 *
 * Both take the same neutral ink; only the dash says which relation it is. Value on an
 * edge means one thing here — whether it touches the selected or pointed-at node — and
 * measured against the canvas ground every mark clears the 3:1 non-text floor: 13.6:1
 * (page), 6.1:1 (source), 5.2:1 (concept and edge) and 4.2:1 (selected).
 *
 * **Every distinction survives with the colour removed.** Shape separates the three node
 * kinds, dash separates the two relations, and **size** now separates a busy mark from a
 * quiet one — so the picture is still readable when indigo is the only colour on it,
 * which it is, and only ever on the selection.
 *
 * ## What the 2026-09-07 rebuild added, and why each was needed
 *
 * The owner's verdict on the shipped picture was that it was *"a static hairball —
 * identical thin grey straight lines, nothing moves, nothing responds"*. Four of the five
 * answers are in this file:
 *
 * 1. **Degree grades the mark** (`radii`, a 5–10px band). Every dot was the same size, so
 *    a source six pages were written from looked exactly like one nobody had opened.
 * 2. **Edges bow** (`EDGE_BOW_RATIO`). Between two clusters that cite each other, straight
 *    lines of equal length lie on top of one another and read as one thick line; a gentle
 *    curve whose depth grows with length separates them without moving a single node.
 * 3. **Everything away from the pointer dims** (`dim` + `focus`). On a folder where six
 *    pages cite the same seven sources, position cannot separate anything — no layout can
 *    cluster a near-complete bipartite graph. Attention has to do it, and dimming to 35%
 *    is what turns "which of these lines are mine" into a question the picture answers.
 * 4. **Every mark carries a 1px halo of the ground** it stands on, so a dot over a bundle
 *    of lines is still a dot. It is a *ground-coloured* separation, not a glow:
 *    `.claude/rules/forbidden.md` forbids a colour spreading outward, and nothing here
 *    spreads or animates.
 *
 * ## What is deliberately absent
 *
 * No glow, no gradient, no shadow, no scale-on-hover. A selected node is bigger by its
 * ring and different by its ink, which are both measurable; a bloom is neither.
 */

export interface LibraryGraphFrame {
  nodes: readonly LibraryGraphNode[];
  edges: readonly LibraryGraphEdge[];
  positions: ReadonlyMap<string, LayoutPoint>;
  /** CSS pixels; the caller has already applied the device-pixel transform. */
  width: number;
  height: number;
  ink: LibraryGraphInk;
  selectedId: string | null;
  /**
   * Under the pointer. Separate from {@link focusedId} because they are separate states
   * (design-interaction, 2026-09-06): a mouse crossing the canvas used to erase where the
   * keyboard was, leaving a focused canvas pointing at nothing.
   */
  hoveredId: string | null;
  /** Where the keyboard is. Wears the focus ring even while the pointer is elsewhere. */
  focusedId: string | null;
  /** Drawn beside whichever of the two is showing. Absent while nothing is pointed at. */
  activeLabel: string | null;
  /**
   * Whether every node wears its name, or only the one being pointed at.
   *
   * The caller decides from the graph's order; this function only obeys, so the policy is
   * one number in one place and the renderer stays a pure function of its frame.
   */
  standingLabels: boolean;
  /**
   * The drawn half-extent of each mark, graded by degree
   * (`libraryMarkRadii`). Absent falls back to the flat {@link NODE_RADIUS} band, which is
   * what every test written before the grading existed still measures.
   */
  radii?: ReadonlyMap<string, number>;
  /**
   * Arrival and departure, 0 → 1. A node Compile has just written fades **in** while the
   * simulation carries it out of its neighbour's position; a node whose file is gone fades
   * **out** from where it was. Missing means 1: fully present.
   */
  opacity?: ReadonlyMap<string, number>;
  /**
   * How far the focus dim has travelled, 0 → 1, eased by the caller over `--motion-fast`.
   * At 1 everything outside {@link focus} is drawn at {@link DIMMED_INK}.
   */
  dim?: number;
  /**
   * What stays at full ink while {@link dim} is above zero: the pointed-at node and its
   * neighbours. Null means nothing is being pointed at and nothing dims.
   */
  focus?: ReadonlySet<string> | null;
  /**
   * Bounded operation marks resolved by the engine to an existing page or source node.
   * They are deliberately marks **on a node**, never a graph edge: a source citation is
   * provenance, not an execution path.
   */
  activity?: readonly LibraryGraphActivityMark[];
  /**
   * **Where the names actually landed**, filled in by this function when the caller hands
   * it an array to fill.
   *
   * A standing name is placed by a greedy screen-space pass that may slide it, truncate it
   * or drop it, so *which* names are on the picture and *where* is decided here and nowhere
   * else. From outside the canvas that is invisible: a screenshot shows a person the
   * overlap and hides it from a gate, which is how five names with an edge through their
   * glyphs shipped in 2026-09-08. The engine passes this only while the `e2e` probe is
   * mounted, so the ordinary frame allocates nothing for it.
   */
  labelReport?: LibraryGraphLabelBox[];
}

/** One placed name, in canvas CSS pixels. `text` is what was drawn, ellipsis included. */
export interface LibraryGraphLabelBox {
  nodeId: string;
  kind: LibraryGraphNodeKind;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontPx: number;
}

type LibraryGraphActivityKind = "read" | "proposal" | "waiting" | "write" | "error";

export interface LibraryGraphActivityMark {
  /** A resolved graph id; unknown/null targets never reach the renderer. */
  nodeId: string;
  kind: LibraryGraphActivityKind;
  /** Current work is static; completed work may travel through its short settle. */
  phase: "active" | "complete";
  /** 0 at the observed completion, 1 after the bounded trail has settled. */
  progress: number;
  /** Reduced motion keeps one fully visible settled symbol without scheduling a trail. */
  settled?: boolean;
  /** Active read/proposal only: one observed-work cycle, never an idle animation phase. */
  turn?: number;
}

/**
 * Half-extent in CSS px, when the caller hands no graded radii.
 *
 * **One step up on 2026-09-06**, when the canvas stopped being a 320px band and became
 * the pane. The source is a step under the circle: a square reads heavier than a circle of
 * the same extent, so matching by *bounding box* would have made the file the loudest mark
 * on a canvas whose subject is the page.
 */
export const NODE_RADIUS: Record<LibraryGraphNodeKind, number> = {
  page: 6,
  source: 5,
  concept: 6,
};

/**
 * What everything outside the pointed-at neighbourhood fades to.
 *
 * 0.35 against an opaque ground, which is the ratio the brief asked for and the one that
 * leaves a dimmed edge visible as *context* while removing it from the reading. It is
 * applied as `globalAlpha` over a ground this canvas painted itself one instruction
 * earlier — not as a translucent token — so there is no compositing surprise of the kind
 * that made low-alpha WebGL marks read as opaque.
 */
export const DIMMED_INK = 0.35;

/** The ring a selected or hovered node wears, outside its own mark. */
const SELECTION_RING_GAP = 3.5;
/** The keyboard's ring sits outside that one, so focus on a selected node is still visible. */
const FOCUS_RING_GAP = 6;
/** Activity remains outside selection/focus rings, so it cannot erase either state. */
const ACTIVITY_RING_GAP = FOCUS_RING_GAP + 2;
/**
 * **Two type steps, and they come from the ramp** — `ink.pageLabelPx` (`--text-body`) for a
 * page's name and `ink.labelPx` (`--text-label`) for a file's or a concept's.
 *
 * ⚠️ This was one literal `11`. The canvas became the Library's whole pane on 2026-09-12 and
 * eleven pixels of grey on a 1088×819 field is what the owner read as *"an ugly popup"*; the
 * subject of the picture is the page, so the page's name takes the step above and everything
 * else keeps the label step. They are resolved from CSS in `library-graph-ink.ts` rather than
 * written here, because a JS copy of a ramp step is the drift the motion token mirror exists
 * to stop and because the ramp is being recalibrated in a parallel change.
 *
 * The hover box keeps the label step at every kind: it is chrome around a name, not the name.
 */
function labelFontPx(ink: LibraryGraphInk, kind: LibraryGraphNodeKind): number {
  return kind === "page" ? ink.pageLabelPx : ink.labelPx;
}
/**
 * A citation, the heavier claim of the two relations — and the widest line this canvas
 * draws, which is why the label halo is stated against it rather than against a number.
 */
export const CITES_WIDTH = 1.5;
/** A mention: the page names the file, nothing says it was written from it. */
const MENTIONS_WIDTH = 1;

/**
 * **The line weight follows the mark band**, floored at the two widths above.
 *
 * Those two were measured on 2026-09-06 against 5–10px marks in a 320px strip. The strip
 * became the pane and the marks grew with it (`libraryMarkBand`), and a 1.5px line between
 * two 34px dots reads as a hairline somebody forgot: the *ratio* is what a person sees, so
 * the ratio is what is held. The scale is the band's top over the 10px it was measured at,
 * and it never goes below 1 — a dense folder keeps exactly the lines that shipped, which is
 * also what keeps the 5.23:1 contrast measurement those widths were taken with honest.
 */
function libraryEdgeWidth(relation: "cites" | "mentions", maxRadius: number): number {
  const base = relation === "mentions" ? MENTIONS_WIDTH : CITES_WIDTH;
  return base * Math.max(1, maxRadius / 10);
}
/** Gap between a mark and the name standing under it. */
const STANDING_LABEL_GAP = 5;

/**
 * **The room the outermost mark needs for its own name**, which is what the fit reserves on
 * every side.
 *
 * It was the constant `LIBRARY_LABEL_ALLOWANCE` (34) — "an 11px label on a 15px line, 5px
 * under a mark up to 10px". Two of those three numbers now follow the canvas: the mark band
 * grows on an emptier canvas and a page's name is set a step up the ramp. A constant would
 * either clip the name at the bottom edge or reserve a margin nothing uses, so the reach is
 * derived from the same two values the renderer draws with.
 */
export function libraryStandingLabelReach(maxRadius: number, pageLabelPx: number): number {
  return maxRadius + STANDING_LABEL_GAP + Math.round(pageLabelPx * 1.35) + 2;
}
/** No standing name is allowed to be wider than this; past it a name is truncated. */
const STANDING_LABEL_MAX_WIDTH = 132;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 4;
const LABEL_GAP = 6;
/** The break an unverified citation carries at its midpoint, in CSS px. */
const BROKEN_EDGE_GAP = 7;
const LABEL_RADIUS = 4;
/** Pointer slop around a mark for a mouse. A 5px square is smaller than any pointer. */
const FINE_HIT_REACH = 4;

/**
 * How deep an edge bows, as a fraction of its own length, capped by {@link EDGE_BOW_MAX}.
 *
 * Depth ∝ length is the property that matters: two long parallel edges separate visibly
 * while a short one between a page and the source beside it stays almost straight, so the
 * curve never travels far enough to suggest a path through somewhere it does not go.
 */
const EDGE_BOW_RATIO = 0.11;
const EDGE_BOW_MAX = 17;
/**
 * The ground each mark clears around itself so it reads over the lines beneath it — **one
 * line width's worth**, since what it is clearing is a line. Stated as a ratio of the widest
 * line for the same reason the widths are: on an emptier canvas both grow together.
 */
const MARK_HALO_RATIO = 1;
/**
 * Half-width of the ground outline every standing name is stroked with, in CSS px.
 *
 * **Two, not one, and the number comes from what crosses a name.** At 1px the halo was
 * narrower than the mark it was defending against: a `cites` line is {@link CITES_WIDTH}
 * (1.5px) and it ran straight through the letterforms — measured at 1400×860 on 2026-09-08,
 * five of the seventeen standing names on the owner's folder had an edge through the middle
 * of their glyphs, `risk-register.html` and `contractor-quotes.csv` among them. Ink cannot
 * fix it: a source's name is `--color-text-tertiary` and the edge is
 * `--color-text-quaternary`, which is 1.17:1 apart, so the two are the same value where they
 * cross whatever the tokens say. Only clearance separates them, and 2px clears the widest
 * line this canvas draws.
 *
 * It is the marks' halo device, in the ground's own colour, stroked *under* the glyph so the
 * letterform is never thickened by it — not a glow, and it never animates.
 */
const LABEL_OUTLINE_PX = 2;

/**
 * The outline, once the widest line on the canvas is wider than the 1.5px it was measured
 * against: the clearance a name needs is the width of what crosses it, so it is one citation
 * width plus the half pixel that took 1.5 to 2.
 */
function labelOutlinePx(maxRadius: number): number {
  return Math.max(LABEL_OUTLINE_PX, libraryEdgeWidth("cites", maxRadius) + 0.5);
}

/**
 * The ruled ground, in screen space — see `LibraryGraphInk.gridMinor` for why it is the
 * map's grid and not something of this canvas's own.
 *
 * Two paths and two strokes for the whole field: 45 verticals and 34 horizontals at
 * 1088×819, against the several hundred operations a frame of this picture already costs.
 * Both spacings are the map's (`grid.ts`): 24px minor, every fifth line major.
 */
const GRID_MINOR_SPACING = 24;
const GRID_CELLS_PER_MAJOR = 5;

function drawGround(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): void {
  ctx.fillStyle = frame.ink.ground;
  ctx.fillRect(0, 0, frame.width, frame.height);
  const major = GRID_MINOR_SPACING * GRID_CELLS_PER_MAJOR;
  ctx.lineWidth = 1;
  for (const pass of ["minor", "major"] as const) {
    ctx.strokeStyle = pass === "minor" ? frame.ink.gridMinor : frame.ink.gridMajor;
    ctx.beginPath();
    for (let x = 0; x <= frame.width; x += GRID_MINOR_SPACING) {
      if ((x % major === 0) !== (pass === "major")) continue;
      // The half pixel is what puts a 1px line on one device row instead of across two.
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, frame.height);
    }
    for (let y = 0; y <= frame.height; y += GRID_MINOR_SPACING) {
      if ((y % major === 0) !== (pass === "major")) continue;
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(frame.width, y + 0.5);
    }
    ctx.stroke();
  }
}

function nodeCentre(frame: LibraryGraphFrame, id: string): LayoutPoint | null {
  return frame.positions.get(id) ?? null;
}

function radiusOf(frame: Pick<LibraryGraphFrame, "radii">, node: LibraryGraphNode): number {
  return frame.radii?.get(node.id) ?? NODE_RADIUS[node.kind];
}

/**
 * Hit testing, shared by the pointer and the renderer so a person can never highlight
 * one node and select another. Generous by 4px: a 5px square is smaller than the
 * pointing device of anybody's hand.
 */
export function hitTestLibraryGraph(
  frame: Pick<LibraryGraphFrame, "nodes" | "positions" | "radii">,
  point: LayoutPoint,
  /** Extra reach around the mark. The caller widens it for a coarse pointer. */
  reachBonus: number = FINE_HIT_REACH,
): LibraryGraphNode | null {
  let best: LibraryGraphNode | null = null;
  let bestDistance = Infinity;
  for (const node of frame.nodes) {
    const centre = frame.positions.get(node.id);
    if (!centre) continue;
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reach = radiusOf(frame, node) + reachBonus;
    if (distance <= reach && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The quadratic control point that gives an edge its bow.
 *
 * Always the same side of the line, so the picture has one consistent hand rather than a
 * scatter of curves; and since every edge in this graph leaves a page, that side is
 * always the same side of the page too.
 */
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
 * Screen-space rectangle intersection with a breathing gap, **wider across than down**.
 *
 * 2px on both axes was the first value and it was measured wrong: `release-dates.csv` and
 * `Release dates` cleared it by a hair and read as one run of text, which is the defect
 * the collision pass exists to prevent rather than a near miss of it. Horizontally two
 * names need a word's worth of space to read as two; vertically a name stands 5px under
 * its own mark by design, so a large gap there would reject every label on the canvas.
 */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  const padX = 7;
  const padY = 2;
  return (
    a.x - padX < b.x + b.width &&
    a.x + a.width + padX > b.x &&
    a.y - padY < b.y + b.height &&
    a.y + a.height + padY > b.y
  );
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawLibraryGraph(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): void {
  const { ink } = frame;
  // The band's own top, which the line weights and the halo are stated against.
  let maxRadius = 0;
  for (const node of frame.nodes) maxRadius = Math.max(maxRadius, radiusOf(frame, node));
  const dim = frame.dim ?? 0;
  const focus = frame.focus ?? null;
  const opacity = frame.opacity;
  /** Full ink, dimmed ink, or somewhere between while the ramp is running. */
  const attention = (id: string): number => {
    /*
     * **The open page never dims** (design-infoviz and design-interaction, converged
     * 2026-09-08). Since the canvas started standing beside the reader, the dim answers
     * two questions with one channel: "not what you are pointing at" and "not what you are
     * reading". Pointing at a different mark used to fade the page a person had open, so
     * the one mark that says *where I am* disappeared exactly while they looked away from
     * it. The selection is exempt, so hover keeps its own answer and the page keeps its.
     */
    if (id === frame.selectedId) return 1;
    if (dim <= 0 || !focus || focus.has(id)) return 1;
    return 1 - (1 - DIMMED_INK) * dim;
  };
  const alphaOf = (id: string): number => attention(id) * (opacity?.get(id) ?? 1);

  ctx.save();
  ctx.globalAlpha = 1;
  drawGround(ctx, frame);

  // ── Edges first, so no line crosses the mark it points at. ──
  // `butt`, not `round`: a round cap adds half a line width to each dash end, which
  // measured a 0.64 duty cycle on a `[3, 3]` pattern — the gap a person is supposed to
  // read was a third narrower than specified (design-infoviz, 2026-09-06).
  ctx.lineCap = "butt";
  const active = frame.hoveredId ?? frame.focusedId;
  for (const edge of frame.edges) {
    const from = nodeCentre(frame, edge.source);
    const to = nodeCentre(frame, edge.target);
    if (!from || !to) continue;
    const touchesSelection =
      frame.selectedId !== null && (edge.source === frame.selectedId || edge.target === frame.selectedId);
    // Pointing at a dot is a question about its links, so its links answer. This is also
    // what gives every edge a reading well above the 3:1 floor on demand.
    const touchesActive = active !== null && (edge.source === active || edge.target === active);
    /*
     * An edge is as present as its dimmer end. A line from a full-ink node to a dimmed one
     * that stayed bright would claim a relationship the dimming has just said is not the
     * one being asked about.
     */
    // The selected page's own lines are part of "where I am", so they are exempt for the
    // same reason its mark is.
    ctx.globalAlpha = touchesSelection ? 1 : Math.min(alphaOf(edge.source), alphaOf(edge.target));
    ctx.beginPath();
    ctx.setLineDash(edge.relation === "mentions" ? [2.5, 3.5] : []);
    ctx.strokeStyle = touchesSelection ? ink.selected : touchesActive ? ink.source : ink.edge;
    /*
     * **The two relations differ in weight as well as in dash** (2026-09-06). Both were
     * 1px, so the only thing separating "this page was written from that file" from "this
     * page happens to name it" was a dash pattern a person had to have read the legend to
     * decode. A citation is the heavier claim and now looks it. Value stays reserved for
     * the selection — this is width, a third channel, and the one the legend needed.
     */
    const relationWidth = libraryEdgeWidth(edge.relation, maxRadius);
    // The two answers a line can give about attention are half a relation width each, so they
    // stay legible against a line that is itself wider on an emptier canvas.
    ctx.lineWidth =
      relationWidth * (touchesSelection ? 1.5 : touchesActive ? 1.33 : 1);
    const control = edgeControlPoint(from, to);
    if (edge.certainty === "unverified") {
      /*
       * One break at the midpoint: the line is drawn as two arcs with a gap, so "there is
       * a citation" and "it may no longer describe this file" are two different marks
       * rather than two shades of one. Each half is the original curve exactly — de
       * Casteljau's split, not a straight chord standing in for it — so the break does not
       * quietly change the shape of the line it interrupts.
       */
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const half = Math.min(BROKEN_EDGE_GAP, length / 3) / 2 / length;
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
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // ── Nodes. ──
  for (const node of frame.nodes) {
    const centre = nodeCentre(frame, node.id);
    if (!centre) continue;
    const radius = radiusOf(frame, node);
    const isSelected = node.id === frame.selectedId;
    const isHovered = node.id === frame.hoveredId;
    const isFocused = node.id === frame.focusedId;
    const ownInk = node.kind === "page" ? ink.page : node.kind === "source" ? ink.source : ink.concept;
    const mark = isSelected ? ink.selected : ownInk;

    /*
     * **The halo, in the ground's own colour.** A ring of canvas is laid down first, one
     * mark's worth wider than the mark, so every line running underneath stops at the dot
     * instead of crossing it. It also clears the inside of the two hollow marks, which is
     * what "the ground shows through" means once there are lines to show through it.
     *
     * This is not a glow. A glow spreads a *colour* outward and usually pulses; this is
     * the background, it is one line width wide ({@link MARK_HALO_RATIO}), and it never
     * animates.
     */
    ctx.globalAlpha = opacity?.get(node.id) ?? 1;
    ctx.fillStyle = ink.ground;
    const halo = libraryEdgeWidth("cites", maxRadius) * MARK_HALO_RATIO;
    if (node.kind === "source") {
      const reach = radius + halo;
      ctx.fillRect(centre.x - reach, centre.y - reach, reach * 2, reach * 2);
    } else {
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius + halo, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = alphaOf(node.id);
    if (node.kind === "source") {
      if (node.state === "not-compiled") {
        // Hollow: nobody has written this file up. The empty square is the positive mark
        // for that state, so it does not have to be read out of a missing line.
        ctx.strokeStyle = mark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
      } else {
        ctx.fillStyle = mark;
        ctx.fillRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
      }
    } else if (node.kind === "concept") {
      // Hollow: the ground shows through, which is the whole of what says "this one is
      // not a file in your folder".
      ctx.beginPath();
      ctx.strokeStyle = mark;
      ctx.lineWidth = 1.5;
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.fillStyle = mark;
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isSelected) {
      ctx.beginPath();
      ctx.strokeStyle = ink.selectedRing;
      ctx.lineWidth = 1;
      ctx.arc(centre.x, centre.y, radius + SELECTION_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isHovered) {
      // Pointing is not choosing, so the hover ring is the neutral one — **and a dotted
      // one**. It used to differ from the selection ring by ink alone, which was the one
      // fact on this canvas carried by colour by itself (design-infoviz, 2026-09-06).
      ctx.beginPath();
      ctx.setLineDash([1, 2]);
      ctx.strokeStyle = ink.hoverRing;
      ctx.lineWidth = 1;
      ctx.arc(centre.x, centre.y, radius + SELECTION_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The keyboard's own mark, outside both of those: where focus is does not stop
    // being true because the pointer moved, and a focused node may also be the
    // selected one.
    if (isFocused) {
      ctx.beginPath();
      ctx.strokeStyle = ink.selectedRing;
      ctx.lineWidth = 2;
      ctx.arc(centre.x, centre.y, radius + FOCUS_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ── Real work, bounded to the node it actually touched. ──
  drawActivityMarks(ctx, frame);

  // ── Every name, while the picture is small enough to hold them. ──
  /*
   * **A picture of unnamed dots is not a picture of anything** (owner, 2026-09-06). Once
   * the canvas became the pane, the seeded folder read at 1512 as five specks on an empty
   * field, and the only way to learn what any of them was was to point at it — one at a
   * time, with nothing left behind. So under the caller's threshold every mark carries its
   * own name, and hover keeps its box for the crowded case above it.
   *
   * ## Losers are hidden, never overlapped
   *
   * Two names crossing each other are worse than one name, because a reader cannot tell
   * which glyphs belong to which dot. The pass is screen-space and greedy in a fixed
   * order — the pointed-at or open neighbourhood first, then pages, sources and concepts,
   * each in the graph's own order — so the same folder drops the same names on every draw
   * and on every machine. The marks themselves are occupied first: a name may lose to a
   * **dot** as well as to another name, which is what stops a label from sitting on top of
   * the thing it is not naming.
   */
  if (frame.standingLabels) {
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    const taken: Array<{ x: number; y: number; width: number; height: number; of?: string }> = [];
    for (const node of frame.nodes) {
      const centre = nodeCentre(frame, node.id);
      if (!centre) continue;
      const half = radiusOf(frame, node);
      taken.push({
        x: centre.x - half,
        y: centre.y - half,
        width: half * 2,
        height: half * 2,
        // Its own mark is the one box a name is allowed to sit under: that is where it is
        // put. Everything else — every other mark, every name already placed — can block.
        of: node.id,
      });
    }
    const order: LibraryGraphNodeKind[] = ["page", "source", "concept"];
    /*
     * ⚠️ **The neighbourhood is named before the rest of the folder.**
     *
     * The pass is greedy, so whoever is asked first keeps the room. Asking in kind order
     * alone meant the ego set competed for label slots on equal terms with the marks the
     * dim had just pushed away — and in a narrow column there are few slots to lose.
     * Measured 2026-09-08 on a 50-node folder at 1512, with a page open beside the canvas
     * (287×852): **three names were placed and all three were dimmed ones**. The open page,
     * its seven sources and its concepts were anonymous, while three unrelated marks were
     * the only things on the picture that said what they were. That is the attention model
     * inverted — identity spent on exactly what the frame is suppressing.
     *
     * So focus is the first sort key and kind the second, with the graph's own order
     * breaking the tie, which keeps the pass deterministic: the same folder drops the same
     * names on every draw and on every machine. With nothing pointed at and nothing open
     * `focus` is null, every node ranks alike, and the order is the one above unchanged.
     */
    const rank = (node: LibraryGraphNode): number => {
      const near = !focus || focus.has(node.id) || node.id === frame.selectedId ? 0 : 1;
      return near * order.length + order.indexOf(node.kind);
    };
    const named = frame.nodes
      .map((node, index) => ({ node, index }))
      .sort((first, second) => rank(first.node) - rank(second.node) || first.index - second.index);
    for (const { node } of named) {
      // The pointed-at node already has a box of its own; two names for one dot is a
      // duplicate, and the box would draw over the standing one anyway.
      if (node.id === active) continue;
      const centre = nodeCentre(frame, node.id);
      if (!centre) continue;
      // Per kind, before anything is measured: a page's name is set one step up the ramp, so
      // its width, its line and the box the collision pass tests are all that step's.
      const fontPx = labelFontPx(ink, node.kind);
      ctx.font = `${fontPx}px ${ink.fontFamily}`;
      const lineHeight = Math.round(fontPx * 1.35);
      const text = truncateToWidth(
        ctx,
        node.label,
        Math.min(STANDING_LABEL_MAX_WIDTH, frame.width - 8),
      );
      if (!text) continue;
      const width = ctx.measureText(text).width;
      /*
       * **Slid back inside the frame, not dropped for being near the edge.** The first
       * build hid any name whose box left the canvas, and measured at 1512 that cost the
       * two marks nearest the left and right edges their names — the fit puts a node
       * within 21px of both edges by design, so the rule was hiding exactly the dots a
       * person is most likely to be looking at. It slides; only a genuine collision
       * hides.
       */
      const left = Math.min(
        Math.max(2, centre.x - width / 2),
        Math.max(2, frame.width - 2 - width),
      );
      const box = {
        x: left,
        y: centre.y + radiusOf(frame, node) + STANDING_LABEL_GAP,
        width,
        height: lineHeight,
      };
      // Below the frame there is nowhere to slide to, so that one still loses.
      if (box.y + box.height > frame.height - 2) continue;
      if (taken.some((other) => other.of !== node.id && overlaps(box, other))) continue;
      taken.push(box);
      frame.labelReport?.push({
        nodeId: node.id,
        kind: node.kind,
        text,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fontPx,
      });
      /*
       * A page is what somebody wrote and is the subject of this canvas; a file and a
       * concept are what it stands on. The two inks are the ones the marks already
       * carry, so the names sit in the same hierarchy as the dots they belong to.
       *
       * A name dims with the mark it belongs to. A bright name over a dimmed dot would
       * be the loudest thing on a canvas that has just been told to quieten it.
       */
      ctx.globalAlpha = alphaOf(node.id);
      /*
       * **A 1px outline of the ground, under every name.** A canvas this connected puts
       * a line under most labels, and grey glyphs crossed by a grey line are the one
       * thing on this picture a person genuinely cannot read. The outline is the same
       * device as the marks' halo and the same colour — the ground, never a colour
       * spreading outward — and it is stroked before the fill so the glyph itself is
       * never thickened by it.
       */
      ctx.strokeStyle = ink.ground;
      ctx.lineWidth = labelOutlinePx(maxRadius) * 2;
      ctx.lineJoin = "round";
      ctx.strokeText(text, box.x + box.width / 2, box.y);
      /*
       * ⚠️ **A name takes its own mark's ink** — which is what the paragraph above always
       * claimed and what the code did not do. A source was drawn at `ink.source` (6.13:1)
       * and then named at `ink.concept` (5.23:1), which is *the edge ink*: eight of the
       * nineteen names on the owner's folder were set in exactly the value of every line
       * that crossed them (2026-09-08). Three kinds, three inks, the same three the marks
       * carry.
       */
      ctx.fillStyle = node.kind === "page" ? ink.page : node.kind === "source" ? ink.source : ink.concept;
      // Drawn from the box, not the centre: a slid label is no longer centred on its dot.
      ctx.fillText(text, box.x + box.width / 2, box.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // ── The one label, beside the node being pointed at. ──
  const activeNode = active ? frame.nodes.find((node) => node.id === active) ?? null : null;
  const activeCentre = active ? nodeCentre(frame, active) : null;
  if (activeNode && activeCentre && frame.activeLabel) {
    ctx.font = `${ink.labelPx}px ${ink.fontFamily}`;
    ctx.textBaseline = "middle";
    /*
     * **The label is fitted to the canvas before it is placed** (2026-09-06). The box was
     * only ever flipped and left-clamped, which holds while the canvas is a full-pane
     * band; once the canvas is no wider than the picture it frames, a long name —
     * `Checkout · Open on the map` measures 168px — is wider than the clearance on either
     * side and ran off the right edge. Truncating keeps the whole box inside the frame,
     * and an ellipsis says a name was shortened rather than that the file is called that.
     */
    const maxBoxWidth = Math.max(LABEL_PAD_X * 2, frame.width - 4);
    const text = truncateToWidth(ctx, frame.activeLabel, maxBoxWidth - LABEL_PAD_X * 2);
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + LABEL_PAD_X * 2;
    const boxHeight = ink.labelPx + LABEL_PAD_Y * 2;
    // Flip to the other side rather than let the label leave the canvas: a name that
    // runs off the edge is the same as no name.
    // Measured from the **edge of the mark and its ring**, not from the node's centre:
    // an 8px gap from the centre put the box on top of the ring it was labelling.
    const clearance = radiusOf(frame, activeNode) + SELECTION_RING_GAP + LABEL_GAP;
    let x = activeCentre.x + clearance;
    if (x + boxWidth > frame.width - 2) x = activeCentre.x - clearance - boxWidth;
    if (x < 2) x = 2;
    // Both edges, not just the left one: flipping a box that is wider than the clearance
    // allows only moves which edge it leaves through.
    if (x + boxWidth > frame.width - 2) x = Math.max(2, frame.width - 2 - boxWidth);
    let y = activeCentre.y - boxHeight / 2;
    if (y < 2) y = 2;
    if (y + boxHeight > frame.height - 2) y = frame.height - 2 - boxHeight;

    ctx.fillStyle = ink.labelSurface;
    roundedRect(ctx, x, y, boxWidth, boxHeight, LABEL_RADIUS);
    ctx.fill();
    ctx.strokeStyle = ink.labelBorder;
    ctx.lineWidth = 1;
    roundedRect(ctx, x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1, LABEL_RADIUS);
    ctx.stroke();
    ctx.fillStyle = ink.labelInk;
    ctx.fillText(text, x + LABEL_PAD_X, y + boxHeight / 2);
  }

  ctx.restore();
}

/**
 * The activity overlay is intentionally local: it never draws a line between two nodes or
 * changes their positions. A pulse is evidence of one observed operation, not a story about
 * a pipeline that the vault never recorded.
 */
function drawActivityMarks(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): void {
  for (const activity of frame.activity ?? []) {
    const node = frame.nodes.find((candidate) => candidate.id === activity.nodeId);
    const centre = nodeCentre(frame, activity.nodeId);
    if (!node || !centre) continue;

    const radius = radiusOf(frame, node);
    const trail = activity.phase === "complete" && !activity.settled ? Math.min(1, Math.max(0, activity.progress)) : 0;
    const reach = radius + ACTIVITY_RING_GAP + trail * FOCUS_RING_GAP;
    const turn = activity.phase === "active" ? (activity.turn ?? 0) * Math.PI * 2 : 0;
    ctx.globalAlpha = activity.phase === "complete" && !activity.settled ? 1 - trail * 0.72 : 1;
    ctx.strokeStyle = activity.kind === "error" ? frame.ink.danger : frame.ink.selectedRing;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = activity.kind === "write" ? 1.5 : 1;
    ctx.setLineDash([]);

    if (activity.kind === "read") {
      // An open ring: a read touched this one mark, rather than travelling down an edge.
      ctx.beginPath();
      ctx.arc(
        centre.x,
        centre.y,
        reach,
        activity.phase === "active" ? turn - Math.PI * 0.35 : -Math.PI * 0.7,
        activity.phase === "active" ? turn + Math.PI * 0.35 : Math.PI * 0.7,
      );
      ctx.stroke();
    } else if (activity.kind === "proposal") {
      // A dashed diamond says provisional without relying on the indigo value alone.
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - reach);
      ctx.lineTo(centre.x + reach, centre.y);
      ctx.lineTo(centre.x, centre.y + reach);
      ctx.lineTo(centre.x - reach, centre.y);
      ctx.closePath();
      ctx.stroke();
      if (activity.phase === "active") {
        // The short orbit is lifecycle-bound: a proposal remains visible only while the
        // in-flight snapshot exists, never as an ambient progress percentage.
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, reach, turn - Math.PI * 0.35, turn + Math.PI * 0.35);
        ctx.stroke();
      }
    } else if (activity.kind === "waiting") {
      // Pending is deliberately still. The engine paints it once, then sleeps until state changes.
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(centre.x - reach, centre.y - reach, reach * 2, reach * 2);
    } else if (activity.kind === "write") {
      // The double rim is reserved for an observed local file delta, never tool completion alone.
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, reach, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(radius + ACTIVITY_RING_GAP - 2, radius + 1), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // An X remains legible after colour removal and does not imply a relation or a retry.
      const cross = reach * 0.7;
      ctx.beginPath();
      ctx.moveTo(centre.x - cross, centre.y - cross);
      ctx.lineTo(centre.x + cross, centre.y + cross);
      ctx.moveTo(centre.x + cross, centre.y - cross);
      ctx.lineTo(centre.x - cross, centre.y + cross);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

/**
 * `text` fitted to `maxWidth`, **shortened in the middle** when it does not fit.
 *
 * ⚠️ **The ellipsis moved from the end to the middle on 2026-09-08, and the reason is a
 * measurement, not a preference.** A folder's names are overwhelmingly a shared stem plus a
 * distinguishing tail — a date, a number, an extension — because that is how people name
 * files and how Compile names the page it writes from one. Cutting the tail therefore cuts
 * exactly the characters that tell two marks apart. On the owner's own folder at 1400×860
 * the 132px budget rendered `volunteer-email-2026-09-02.txt` and
 * `volunteer-email-2026-09-05.txt` as **the same string**, `volunteer-email-2026-0…`, on two
 * different squares 200px apart, and did the same to the two `council-minutes-2026-0…`
 * marks. Two marks wearing one name is worse than a mark wearing none: it is a picture that
 * answers a question wrongly.
 *
 * Keeping both ends costs nothing — it is the same budget, spent on the informative half —
 * and it is the rule a file list, a tab strip and a breadcrumb already use, so it is the
 * shortening a person has been trained to read.
 *
 * Binary search on the head, with the tail held at a third of the budget: a name is measured
 * about seven times instead of once per glyph.
 *
 * Returns `""` only when even the ellipsis does not fit, which is a canvas too small to
 * carry a label at all.
 */
function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  /*
   * The tail is the shorter half. A stem is usually longer than what distinguishes it, and a
   * name cut to two equal halves reads as two fragments rather than as one name shortened.
   */
  const tailBudget = maxWidth / 3;
  let tail = 0;
  while (
    tail < text.length - 1 &&
    ctx.measureText(text.slice(text.length - (tail + 1))).width <= tailBudget
  ) {
    tail += 1;
  }
  const suffix = `${ellipsis}${text.slice(text.length - tail)}`;
  if (ctx.measureText(suffix).width > maxWidth) {
    // No room for a tail at all: fall back to the plain head-and-ellipsis form.
    return `${headThatFits(ctx, text, maxWidth - ctx.measureText(ellipsis).width)}${ellipsis}`;
  }
  const head = headThatFits(ctx, text, maxWidth - ctx.measureText(suffix).width);
  return `${head}${suffix}`;
}

/** The longest prefix of `text` whose width is within `budget`. */
function headThatFits(ctx: CanvasRenderingContext2D, text: string, budget: number): string {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(text.slice(0, middle)).width <= budget) low = middle;
    else high = middle - 1;
  }
  return text.slice(0, low);
}
