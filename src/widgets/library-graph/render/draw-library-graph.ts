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
   * Whether a file's and a concept's name exist on this frame at all.
   *
   * The caller answers it from the camera — `view.scale >= SOURCE_LABEL_MIN_SCALE` — so the
   * policy is one comparison in one place and the renderer stays a pure function of its
   * frame. A source that is pointed at, selected, or in the open page's neighbourhood is
   * named whatever this says.
   */
  sourceLabels: boolean;
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
 * Half-extent in world units, when the caller hands no graded radii — the floor of the
 * fixed scale `libraryMarkRadii` grades inside.
 *
 * The source is well under the circle: a square reads heavier than a circle of the same
 * extent, so matching by *bounding box* would make the file the loudest mark on a canvas
 * whose subject is the page.
 */
export const NODE_RADIUS: Record<LibraryGraphNodeKind, number> = {
  page: 5,
  source: 3.5,
  concept: 5,
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
 * **Two type steps, and they come from the ramp** — `ink.pageLabelPx` (`--text-label`, 11px at
 * a 16px root) for a page's name and `ink.captionPx` (`--text-caption`, 9.5px) for a file's or
 * a concept's.
 *
 * ⚠️ A page's name was briefly `--text-body` (12.5px), taken on 2026-09-12 when twelve marks
 * stood on a 1088×819 field and eleven pixels of grey read as an afterthought. Three hundred
 * documents is the case that step was never measured against: at `--text-body` the page names
 * collide often enough that the placement pass hides a third of them, so the larger step
 * *costs* names. A page is back at the label step and a file — whose name only appears zoomed
 * in or pointed at — drops to the caption step, so a page's name is the larger of the two
 * wherever both are on the canvas.
 *
 * Both are resolved from CSS in `library-graph-ink.ts`, through `cssLengthToPx`, because since
 * 2026-09-12 the ramp is declared in `rem` and a `parseFloat` of `"0.6875rem"` is 0.6875 — a
 * number that is finite, positive, and off by a factor of sixteen.
 *
 * The hover box keeps the label step at every kind: it is chrome around a name, not the name.
 */
function labelFontPx(ink: LibraryGraphInk, kind: LibraryGraphNodeKind): number {
  return kind === "page" ? ink.pageLabelPx : ink.captionPx;
}
/**
 * A citation, the heavier claim of the two relations — and the widest line this canvas
 * draws, which is why the label halo is stated against it rather than against a number.
 */
export const CITES_WIDTH = 1.5;
/** A mention: the page names the file, nothing says it was written from it. */
const MENTIONS_WIDTH = 1;

/**
 * **The line weight is fixed**, at the two widths above.
 *
 * ⚠️ It briefly followed the mark band — `base × max(1, maxRadius / 10)` — because the band
 * followed the canvas and a 1.5px line between two 34px dots reads as a hairline somebody
 * forgot. The band no longer follows the canvas, so neither does this, and a fixed weight is
 * what keeps the 5.23:1 contrast measurement those widths were taken with honest at every
 * window size and every folder.
 */
function libraryEdgeWidth(relation: "cites" | "mentions"): number {
  return relation === "mentions" ? MENTIONS_WIDTH : CITES_WIDTH;
}
/** Gap between a mark and the name standing under it. */
const STANDING_LABEL_GAP = 5;

/** No standing name is allowed to be wider than this; past it a name is truncated. */
const STANDING_LABEL_MAX_WIDTH = 132;
/**
 * **The longest name this canvas prints, in characters.**
 *
 * The width cap above is a pixel budget and does its own truncation, so this looks
 * redundant and is not: at 9.5px a 132px budget is about 30 characters of Latin and about
 * 13 of Hangul, so the *same* folder printed names of two very different lengths depending
 * on the script. A character cap applied first makes the shortening one rule a person can
 * learn — and 24 is where a file name's stem and its extension both still survive
 * (`chargeback-runbook.md` is 21).
 */
const STANDING_LABEL_MAX_CHARS = 24;
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

/** The clearance a name needs is the width of what crosses it: one citation width, floored. */
function labelOutlinePx(): number {
  return Math.max(LABEL_OUTLINE_PX, libraryEdgeWidth("cites") + 0.5);
}

/**
 * The ground: one flat fill, and nothing else on it.
 *
 * ⚠️ **This used to draw the map's blueprint grid** — `--map-grid-minor` / `--map-grid-major`
 * at 24 and 120px, static in screen space, taken on 2026-09-12 because the canvas had become
 * the Library's whole pane and read as a void with marks on it. The owner's verdict on the
 * build that shipped it names the grid's real effect: graph paper under a dozen dots makes
 * the dots look like a sample of something, and it sets a second, finer rhythm for the eye to
 * follow that no relation in the folder corresponds to. At three hundred marks it is worse —
 * the ruling reads through the picture as texture competing with the citations.
 *
 * A canvas is allowed a ground (`docs/DESIGN-SYSTEM.md`, 2026-09-08). What this one takes is
 * the app's own surface, so the picture sits in the pane rather than on a sheet inside it.
 */
function drawGround(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): void {
  ctx.fillStyle = frame.ink.ground;
  ctx.fillRect(0, 0, frame.width, frame.height);
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
    const relationWidth = libraryEdgeWidth(edge.relation);
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
     * **The halo.** A ring is laid down first, one line width wider than the mark, so every
     * line running underneath stops at the dot instead of crossing it. It also clears the
     * inside of the two hollow marks, which is what "the ground shows through" means once
     * there are lines to show through it.
     *
     * A **page** clears itself in `--graph-page-halo`, a shade above the ground: eight or
     * ten citations meet one page on a busy folder, and a ring of flat ground there cuts a
     * hole in the picture instead of putting the page on top of it. Everything else clears
     * in the ground, where one or two lines arrive and there is nothing to soften.
     *
     * This is not a glow. A glow spreads a *colour* outward and usually pulses; this is one
     * flat fill, one line width wide ({@link MARK_HALO_RATIO}), and it never animates.
     */
    ctx.globalAlpha = opacity?.get(node.id) ?? 1;
    ctx.fillStyle = node.kind === "page" ? ink.pageHalo : ink.ground;
    const halo = libraryEdgeWidth("cites") * MARK_HALO_RATIO;
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

  // ── The names. ──
  /*
   * **A picture of unnamed dots is not a picture of anything** (owner, 2026-09-06), and
   * **three hundred names is not a picture either.** The first of those was measured on a
   * twelve-mark folder; the second on a sixty-page, three-hundred-file one, where naming
   * every mark put 288 of 360 names into a collision and the pass then hid whichever ones
   * lost, which is a different arbitrary third of the folder at every window size.
   *
   * So the names are **semantic**, not thresholded:
   *
   * - **A page always carries its name.** It is the subject of this canvas and the thing a
   *   person came to read off it — "which write-ups exist" is answered by a name or not at
   *   all. When two page names collide the **quieter** page loses, so the folder's busiest
   *   write-ups are the ones that stay named at every size (`rank`, below).
   * - **A file or a concept carries its name only when the screen is about it**: zoomed in
   *   past `SOURCE_LABEL_MIN_SCALE`, pointed at, or in the neighbourhood of the page that is
   *   open. Otherwise it is a dot, and its name is one hover away.
   *
   * ## Losers are hidden, never overlapped
   *
   * Two names crossing each other are worse than one name, because a reader cannot tell
   * which glyphs belong to which dot. The pass is screen-space and greedy in a fixed order,
   * so the same folder drops the same names on every draw and on every machine. The marks
   * themselves are occupied first: a name may lose to a **dot** as well as to another name,
   * which is what stops a label from sitting on top of the thing it is not naming.
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
     * So focus is the first key, kind the second — a page before a file before a concept —
     * and **the mark's own size the third, largest first**. That last one is the 2026-09-12
     * change: a page's radius is its citation count (`libraryMarkRadii`), so asking the
     * busiest page first means a collision is always resolved against the quieter of the two
     * names. The graph's own order breaks the remaining ties, which keeps the pass
     * deterministic: the same folder drops the same names on every draw and on every
     * machine.
     */
    const order: LibraryGraphNodeKind[] = ["page", "source", "concept"];
    const rank = (node: LibraryGraphNode): number => {
      const near = !focus || focus.has(node.id) || node.id === frame.selectedId ? 0 : 1;
      return near * order.length + order.indexOf(node.kind);
    };
    /** Whether a file's or a concept's name exists on this frame at all. */
    const carriesName = (node: LibraryGraphNode): boolean => {
      if (node.kind === "page") return true;
      if (frame.sourceLabels) return true;
      if (node.id === frame.selectedId || node.id === active) return true;
      return focus !== null && focus.has(node.id);
    };
    const named = frame.nodes
      .map((node, index) => ({ node, index }))
      .sort(
        (first, second) =>
          rank(first.node) - rank(second.node) ||
          radiusOf(frame, second.node) - radiusOf(frame, first.node) ||
          first.index - second.index,
      );
    for (const { node } of named) {
      // The pointed-at node already has a box of its own; two names for one dot is a
      // duplicate, and the box would draw over the standing one anyway.
      if (node.id === active) continue;
      if (!carriesName(node)) continue;
      const centre = nodeCentre(frame, node.id);
      if (!centre) continue;
      // Per kind, before anything is measured: a page's name is set one step up the ramp, so
      // its width, its line and the box the collision pass tests are all that step's.
      const fontPx = labelFontPx(ink, node.kind);
      ctx.font = `${fontPx}px ${ink.fontFamily}`;
      const lineHeight = Math.round(fontPx * 1.35);
      const text = truncateToWidth(
        ctx,
        middleEllipsis(node.label, STANDING_LABEL_MAX_CHARS),
        Math.min(STANDING_LABEL_MAX_WIDTH, frame.width - 8),
      );
      if (!text) continue;
      const width = ctx.measureText(text).width;
      /*
       * **Four places a name may stand, and it takes the first that is free.**
       *
       * ⚠️ There used to be one — under the mark — and a name that could not stand there was
       * dropped. That is affordable on twelve marks and ruinous on three hundred: measured on
       * the 372-mark fixture at 1512, **8 of 60** write-ups were named, because under a hub
       * the room is exactly where that hub's own satellites are. Under, over, right, left, in
       * that order: under first because a name under a dot is the one a person reads without
       * being told which dot it belongs to, and the other three only when under is taken.
       * After: 34 of 60.
       *
       * Horizontally the name is **slid back inside the frame rather than dropped** for being
       * near the edge. The first build hid any name whose box left the canvas, and at 1512
       * that cost the two marks nearest the left and right edges their names — the fit puts a
       * node near both edges by design, so the rule was hiding exactly the dots a person is
       * most likely to be looking at.
       */
      const half = radiusOf(frame, node);
      const centred = Math.min(
        Math.max(2, centre.x - width / 2),
        Math.max(2, frame.width - 2 - width),
      );
      const candidates = [
        { x: centred, y: centre.y + half + STANDING_LABEL_GAP },
        { x: centred, y: centre.y - half - STANDING_LABEL_GAP - lineHeight },
        { x: centre.x + half + STANDING_LABEL_GAP, y: centre.y - lineHeight / 2 },
        { x: centre.x - half - STANDING_LABEL_GAP - width, y: centre.y - lineHeight / 2 },
      ];
      let box: { x: number; y: number; width: number; height: number } | null = null;
      for (const candidate of candidates) {
        const tried = { x: candidate.x, y: candidate.y, width, height: lineHeight };
        // Off the frame there is nowhere to slide to, so that placement loses.
        if (tried.y < 2 || tried.y + tried.height > frame.height - 2) continue;
        if (tried.x < 2 || tried.x + tried.width > frame.width - 2) continue;
        if (taken.some((other) => other.of !== node.id && overlaps(tried, other))) continue;
        box = tried;
        break;
      }
      if (!box) continue;
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
       * A name dims with the mark it belongs to. A bright name over a dimmed dot would be
       * the loudest thing on a canvas that has just been told to quieten it.
       */
      ctx.globalAlpha = alphaOf(node.id);
      /*
       * **An outline of the ground, under every name.** A canvas this connected puts a line
       * under most labels, and grey glyphs crossed by a grey line are the one thing on this
       * picture a person genuinely cannot read. The outline is the same device as the marks'
       * halo and the same colour — the ground, never a colour spreading outward — and it is
       * stroked before the fill so the glyph itself is never thickened by it.
       */
      ctx.strokeStyle = ink.ground;
      ctx.lineWidth = labelOutlinePx() * 2;
      ctx.lineJoin = "round";
      ctx.strokeText(text, box.x + box.width / 2, box.y);
      /*
       * ⚠️ **A name is set one step brighter than its own mark, never in the mark's ink.**
       * A source's mark is `--color-text-quaternary`, which is also the edge ink: eight of
       * nineteen names on the owner's folder were once set in exactly the value of every
       * line that crossed them (2026-09-08). A page's name takes the page ink, which is
       * already the brightest on the canvas; a file's and a concept's take
       * `--color-text-tertiary`, one step above their own dot and clear of the lines.
       */
      ctx.fillStyle = node.kind === "page" ? ink.page : ink.sourceLabel;
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
   * **A phrase is cut off the end, at a word boundary**, for the reason `middleEllipsis`
   * gives: a middle ellipsis through a sentence leaves two half-words. Only a name with no
   * space in it — a file name, whose extension is half of what it says — keeps the tail.
   */
  if (text.includes(" ")) {
    const head = headThatFits(ctx, text, maxWidth - ctx.measureText(ellipsis).width);
    const lastSpace = head.lastIndexOf(" ");
    const cut = lastSpace > head.length / 2 ? head.slice(0, lastSpace) : head;
    return `${cut.trimEnd()}${ellipsis}`;
  }
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

/**
 * **The character cap — out of the middle of a file name, off the end of a phrase.**
 *
 * ⚠️ **One rule for both was the walkthrough's finding.** Three cold walkers on the
 * 372-mark folder each named three write-ups inside ten seconds and each, unprompted,
 * reported the same defect: `What compliance…not see`, `What support o…he rest`,
 * `What the paymen…not say` — a middle ellipsis through a *sentence* cuts words in half at
 * both ends and leaves something a person cannot read as English.
 *
 * A file name and a title are shortened for different reasons, so they are shortened
 * differently:
 *
 * - **A file name has no spaces and its tail is what distinguishes it** —
 *   `payments-settlement-01.csv` against `payments-settlement-02.csv`, and the extension is
 *   half of what the mark means. It keeps the middle ellipsis, head and tail both.
 * - **A title is a phrase, and a phrase reads from the front.** It is cut at the last word
 *   boundary that fits, with the ellipsis at the end, so what is left is still a readable
 *   run of words.
 */
function middleEllipsis(text: string, maxChars: number): string {
  const glyphs = [...text];
  if (glyphs.length <= maxChars) return text;
  const keep = maxChars - 1;
  if (text.includes(" ")) {
    const head = glyphs.slice(0, keep).join("");
    const lastSpace = head.lastIndexOf(" ");
    // Only snap back to a word boundary when a word actually survives it; a first word
    // longer than the budget is cut where the budget ends rather than erased.
    const cut = lastSpace > keep / 2 ? head.slice(0, lastSpace) : head;
    return `${cut.trimEnd()}…`;
  }
  // One of the budget goes to the ellipsis; the tail keeps a third of what is left, which
  // is the same split `truncateToWidth` uses so the two rules do not disagree in shape.
  const tail = Math.max(1, Math.floor(keep / 3));
  const head = keep - tail;
  return `${glyphs.slice(0, head).join("")}…${glyphs.slice(glyphs.length - tail).join("")}`;
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
