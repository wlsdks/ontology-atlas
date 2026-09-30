import { LibraryLabelCoverage } from "./library-label-coverage";
import { LibraryLabelMarkIndex } from "./library-label-mark-index";
import type { LibraryGraphEdge, LibraryGraphNode, LibraryGraphNodeKind } from "../model/build-library-graph";
import { easeMotion, type LayoutPoint } from "../model/library-graph-layout";
import type { LibraryPositionLookup } from "../model/library-graph-view";
import type { LibraryGraphInk } from "./library-graph-ink";

/**
 * One frame of the library graph. No React, DOM or clock: it paints what it is handed, so
 * every rule is testable without a browser.
 *
 * | Node | Mark |
 * |---|---|
 * | page | filled circle, the brightest neutral: what somebody wrote |
 * | source | filled square, hollow when not compiled: a file, not a thought |
 * | concept | unfilled ring: it lives on the map, elsewhere |
 *
 * | Edge | Mark |
 * |---|---|
 * | cites, hash still matching | solid, 1.5px |
 * | mentions | dashed, 1px |
 * | either, unverified | broken once at its midpoint, with an amber dot in the break |
 *
 * Every distinction survives without colour: shape for kind, dash and width for relation,
 * size for a page's citations; indigo only marks the selection. Every mark clears the 3:1
 * non-text floor on the canvas ground. Edges bow so parallel lines stay apart, everything
 * outside the pointed-at neighbourhood dims, and each mark carries a halo of ground one
 * citation width wide (`MARK_HALO_RATIO`), not a glow.
 */

export interface LibraryGraphGeometry {
  positions: ReadonlyMap<string, LayoutPoint>;
  radii: ReadonlyMap<string, number>;
}

interface LibraryGraphIsland {
  id: string;
  kind: "concept" | "folder" | "unsorted" | "unread";
  label: string;
  x: number;
  y: number;
  r: number;
  pages: number;
  sources: number;
  stale: number;
  /** How far along its arrival the island is, 0–1; its body, shore and name fade in with it. */
  arrival?: number;
  /** The Unread shore's rectangle about `x, y`, in canvas pixels; absent on a disc island. */
  band?: { width: number; height: number };
}

/** The island's outline: a disc, or the shore's rounded band, grown by `inset` on every side. */
function islandPath(ctx: CanvasRenderingContext2D, island: LibraryGraphIsland, inset: number): void {
  ctx.beginPath();
  if (island.band) {
    const w = island.band.width + inset * 2;
    const h = island.band.height + inset * 2;
    ctx.roundRect(island.x - w / 2, island.y - h / 2, w, h, Math.min(ISLAND_SHORE_PX * 2, h / 2));
  } else {
    ctx.arc(island.x, island.y, island.r + inset, 0, Math.PI * 2);
  }
}

export interface LibraryGraphFrame {
  nodes: readonly LibraryGraphNode[];
  edges: readonly LibraryGraphEdge[];
  positions: LibraryPositionLookup;
  overview?: { geometry: LibraryGraphGeometry; view: { x: number; y: number; scale: number } };
  /** CSS pixels; the caller has already applied the device-pixel transform. */
  width: number;
  height: number;
  ink: LibraryGraphInk;
  /** The page's locale, for the one number the renderer writes itself (an island's count). */
  locale?: string;
  selectedId: string | null;
  /** Under the pointer; separate from {@link focusedId}, or a passing mouse erases where the keyboard is. */
  hoveredId: string | null;
  /** Where the keyboard is. Wears the focus ring even while the pointer is elsewhere. */
  focusedId: string | null;
  /** Drawn beside whichever of the two is showing. Absent while nothing is pointed at. */
  activeLabel: string | null;
  /** Whether every node wears its name, or only the pointed-at one; the caller decides. */
  standingLabels: boolean;
  /** `flow`: columns, edges drawn as horizontal S-curves; `force`: the bowed quadratic; `islands`: the overview. */
  layout?: "flow" | "force" | "islands";
  /**
   * Per kind, in screen px, the `labelRoom` a flow column settled on; absent means the flat
   * {@link STANDING_LABEL_MAX_WIDTH} budget.
   */
  flowLabelRoom?: Partial<Record<LibraryGraphNodeKind, number>>;
  /**
   * The islands of the overview, in canvas pixels: drawn under the marks as a body with a
   * name, and the one thing a person can read at rest on a folder of thousands.
   */
  islands?: readonly LibraryGraphIsland[];
  /** The island under the pointer: its rim lights, the way a mark's hover ring does. */
  hoveredIslandId?: string | null;
  /** The island the keyboard stands on: a focus ring outside its rim, as a mark gets one. */
  focusedIslandId?: string | null;
  /** Filled by the name pass with the ids of the islands whose name was placed, for the probe. */
  islandReport?: string[];
  /** Whether a page's name stands at rest; the overview names islands, not pages, until zoomed in. */
  pageLabels?: boolean;
  /** Draw only the edges of the mark being pointed at or held; the overview draws no line at rest. */
  focusEdgesOnly?: boolean;
  /**
   * Whether file and concept names exist on this frame, from the camera
   * (`view.scale >= SOURCE_LABEL_MIN_SCALE`); a pointed-at, selected or open-neighbourhood
   * source is named regardless.
   */
  sourceLabels: boolean;
  /**
   * Whether a concept's name stands at rest. The force picture ties it to the source
   * threshold; in the flow picture an unfolded concept column has a row for every name.
   */
  conceptLabels?: boolean;
  /** Each mark's graded half-extent (`libraryMarkRadii`); absent falls back to {@link NODE_RADIUS}. */
  radii?: ReadonlyMap<string, number>;
  /** Arrival and departure fade, 0 → 1; missing means fully present. */
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
   * Filled with where names actually landed: only this pass knows which names were slid,
   * cut or dropped, and a gate cannot read that from pixels. Passed only while the `e2e`
   * probe is mounted, so an ordinary frame allocates nothing.
   */
  labelReport?: LibraryGraphLabelBox[];
  /**
   * Where knowledge is moving, or null at rest: the one unprompted motion, allowed because
   * it shows a citation's direction. Dashes travel file → page; the line is drawn page→file,
   * so a rising phase is that travel ({@link FLOW_PERIOD}).
   */
  flow?: LibraryGraphFlow | null;
}

export interface LibraryGraphFlow {
  /** Citation edges drifting because a card stands open on one of their ends. */
  edges: ReadonlySet<string>;
  /** 0 → 1 → 0, one dash period. Rising means travelling toward the page. */
  phase: number;
  /** Citation edges drifting **once** because their page has just been written. */
  arrivalEdges: ReadonlySet<string>;
  /** 0 → 1 across the whole arrival: one pass, never a loop. */
  arrivalPhase: number;
  /** Pages that have just landed, and how far through their arrival each one is. */
  arrived: ReadonlyMap<string, number>;
  /** Stale citations whose midpoint breathes, and the breath, 0 → 1 → 0. */
  pulse: ReadonlySet<string>;
  pulsePhase: number;
  /**
   * Reduced motion keeps the direction: a static chevron toward the page on each flowing
   * citation, and a stale midpoint's amber dot at full size.
   */
  still: boolean;
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
 * Half-extent in world units without graded radii. The source is smaller because a square
 * reads heavier than a circle of the same extent.
 */
export const NODE_RADIUS: Record<LibraryGraphNodeKind, number> = {
  page: 5,
  source: 3.5,
  concept: 5,
};

/**
 * What everything outside the pointed-at neighbourhood fades to, as `globalAlpha` over a
 * ground this canvas just painted, not a translucent token, so compositing stays predictable.
 */
export const DIMMED_INK = 0.35;

/** The ring a selected or hovered node wears, outside its own mark. */
const SELECTION_RING_GAP = 3.5;
/** The keyboard's ring sits outside that one, so focus on a selected node is still visible. */
const FOCUS_RING_GAP = 6;
/** Activity remains outside selection/focus rings, so it cannot erase either state. */
const ACTIVITY_RING_GAP = FOCUS_RING_GAP + 2;
/**
 * Two ramp steps: `--text-label` for a page's name, `--text-caption` for a file's or a
 * concept's. A larger page step makes names collide and the placement pass hide a third of
 * them at three hundred documents. The hover box keeps the label step for every kind.
 */
function labelFontPx(ink: LibraryGraphInk, kind: LibraryGraphNodeKind): number {
  return kind === "page" ? ink.pageLabelPx : ink.captionPx;
}
/** A citation, the heavier relation and the widest line, which the label halo is stated against. */
export const CITES_WIDTH = 1.5;
/** A mention: the page names the file, nothing says it was written from it. */
const MENTIONS_WIDTH = 1;

/** Fixed line weight, which keeps the 5.23:1 contrast those widths were measured at true everywhere. */
function libraryEdgeWidth(relation: "cites" | "mentions"): number {
  return relation === "mentions" ? MENTIONS_WIDTH : CITES_WIDTH;
}
/** The least a shortened name may be, on screen, to still be a name: about six glyphs. */
const STANDING_LABEL_MIN_PX = 48;
/** Gap between a mark and the name standing under it. */
const STANDING_LABEL_GAP = 5;

/** No standing name is allowed to be wider than this; past it a name is truncated. */
const STANDING_LABEL_MAX_WIDTH = 132;
/**
 * The longest name in characters, applied before the pixel cap, which alone cuts Latin and
 * Hangul at very different lengths. At 24 a file's stem and extension both survive.
 */
const STANDING_LABEL_MAX_CHARS = 24;
/**
 * The leader search: reach, steps and spokes for pushing a name off its mark, each ring
 * rotated by the golden angle to sample the previous ring's gaps. Past 44px (three label
 * lines) a name no longer reads as that dot's; four steps on twelve spokes cleared the
 * tightest measured folder.
 */
const LEADER_REACH_MAX = 44;
const LEADER_STEPS = 4;
const LEADER_SPOKES = 12;
const LEADER_RING_ROTATION = Math.PI * (3 - Math.sqrt(5));
/**
 * Above this many marks the leader search is skipped: a dense folder already names a subset,
 * a pushed name attaches to the wrong dot, and the O(names × placed) test would cost about
 * seven label passes against a 2ms budget.
 */
const LEADER_MAX_MARKS = 120;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 4;
const LABEL_GAP = 6;
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
 * Most standing amber dots at rest, counted in unverified citations, not marks. Keeps
 * standing amber under 4% of canvas ink
 * (docs/records/decisions/2026-09-13-standing-amber-ink-share-e7854c6f-2475-49ae-821d-2c6dc5bcbdc6.md);
 * 64 sits between the densest legible fixture (48) and what its ink affords (72). Above it
 * no dot stands at all, never a sample, so an undotted stale citation never reads as fresh;
 * the open card, the pointed-at neighbourhood and the held `N sources changed` clause keep theirs.
 */
export const STALE_DOT_STANDING_MAX = 64;
const LABEL_RADIUS = 4;
/** Pointer slop around a mark for a mouse. A 5px square is smaller than any pointer. */
const FINE_HIT_REACH = 4;

/**
 * Bow depth as a fraction of edge length, capped: long parallel edges separate while a short
 * one stays nearly straight and never suggests a path through somewhere else.
 */
const EDGE_BOW_RATIO = 0.11;
const EDGE_BOW_MAX = 17;
/** The ground each mark clears around itself, as a ratio of the widest line it clears. */
const MARK_HALO_RATIO = 1;
/**
 * Half-width of the ground outline stroked under every standing name, in CSS px. It must
 * clear {@link CITES_WIDTH}: name and edge inks are 1.17:1 apart, so only clearance
 * separates a crossing line from the glyphs. Stroked under the glyph, never a glow.
 */
const LABEL_OUTLINE_PX = 2;

/** The clearance a name needs is the width of what crosses it: one citation width, floored. */
function labelOutlinePx(): number {
  return Math.max(LABEL_OUTLINE_PX, libraryEdgeWidth("cites") + 0.5);
}

/**
 * The ground: one flat fill of the app surface (`docs/DESIGN-SYSTEM.md`). No grid: graph
 * paper sets a rhythm no relation in the folder corresponds to.
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

/** The least an island must be across, on screen, to carry its name inside it. */
const ISLAND_LABEL_INSIDE_MIN_PX = 64;
/** How far an island's shore reaches past its rim, in canvas px. */
const ISLAND_SHORE_PX = 5;

/**
 * Each island: a disc a shade above the ground, a hairline rim, and its name with its
 * page count — inside the disc when it is wide enough, under it otherwise, and skipped
 * when it would cross a name already placed. An *Unread* island is drawn with a dashed
 * rim: it is the part of the folder nobody has read, not a topic.
 */
function drawIslands(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame, ink: LibraryGraphInk): void {
  const dim = frame.dim ?? 0;
  for (const island of frame.islands ?? []) {
    const presence = (1 - dim * 0.5) * easeMotion(island.arrival ?? 1);
    ctx.globalAlpha = presence;
    /*
     * A shore: one wider disc at half the halo's strength, a flat fill, never a glow. The
     * Unread island has none and a ground body, since it is not land yet.
     */
    if (island.kind !== "unread") {
      ctx.beginPath();
      ctx.arc(island.x, island.y, island.r + ISLAND_SHORE_PX, 0, Math.PI * 2);
      ctx.fillStyle = ink.pageHalo;
      ctx.globalAlpha = presence * 0.5;
      ctx.fill();
      ctx.globalAlpha = presence;
    }
    islandPath(ctx, island, 0);
    ctx.fillStyle = island.kind === "unread" ? ink.ground : ink.pageHalo;
    ctx.fill();
    const hovered = island.id === frame.hoveredIslandId;
    ctx.lineWidth = hovered ? 1.5 : 1;
    ctx.strokeStyle = hovered ? ink.selectedRing : ink.labelBorder;
    ctx.setLineDash(island.kind === "unread" ? [3, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (island.id === frame.focusedIslandId) {
      islandPath(ctx, island, FOCUS_RING_GAP);
      ctx.strokeStyle = ink.selectedRing;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** The gap between an island's rim (with its shore) and a name standing outside it. */
const ISLAND_NAME_GAP_PX = 3;

/** The most a name may reach into a neighbour's body: its shore and the gap, never a mark. */
const ISLAND_NAME_REACH_MAX_PX = ISLAND_SHORE_PX + ISLAND_NAME_GAP_PX;
/**
 * A name stands beside its own island, never on a neighbour's marks, or it reads as the
 * wrong island's. It tries under, over, right, left and takes the first seat clear of other
 * islands and placed names, else the least-reaching one within the shore; otherwise the
 * island stays unnamed until the camera closes in.
 */
function placeIslandName(
  island: LibraryGraphIsland,
  width: number,
  height: number,
  frame: LibraryGraphFrame,
  placed: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
): { x: number; y: number; width: number; height: number } | null {
  const halfW = island.band ? island.band.width / 2 : island.r;
  const halfH = island.band ? island.band.height / 2 : island.r;
  const reach = ISLAND_SHORE_PX + ISLAND_NAME_GAP_PX;
  const seats = [
    { x: island.x - width / 2, y: island.y + halfH + reach, width, height },
    { x: island.x - width / 2, y: island.y - halfH - reach - height, width, height },
    { x: island.x + halfW + reach + 4, y: island.y - height / 2, width, height },
    { x: island.x - halfW - reach - 4 - width, y: island.y - height / 2, width, height },
  ];
  const others = (frame.islands ?? []).filter((other) => other.id !== island.id);
  let fallback: { seat: (typeof seats)[number]; cover: number } | null = null;
  for (const seat of seats) {
    if (seat.x < 2 || seat.x + seat.width > frame.width - 2 || seat.y < 2 || seat.y + seat.height > frame.height - 2) continue;
    if (placed.some((other) => overlaps(seat, other))) continue;
    const cover = others.reduce((sum, other) => sum + islandCover(seat, other), 0);
    if (cover === 0) return seat;
    if (!fallback || cover < fallback.cover) fallback = { seat, cover };
  }
  return fallback && fallback.cover <= ISLAND_NAME_REACH_MAX_PX ? fallback.seat : null;
}

/** How far a box reaches into an island's body with its shore, in px; 0 when it does not touch. */
function islandCover(
  box: { x: number; y: number; width: number; height: number },
  island: LibraryGraphIsland,
): number {
  const reach = ISLAND_SHORE_PX;
  if (island.band) {
    const left = island.x - island.band.width / 2 - reach;
    const right = island.x + island.band.width / 2 + reach;
    const top = island.y - island.band.height / 2 - reach;
    const bottom = island.y + island.band.height / 2 + reach;
    const dx = Math.min(box.x + box.width, right) - Math.max(box.x, left);
    const dy = Math.min(box.y + box.height, bottom) - Math.max(box.y, top);
    return dx > 0 && dy > 0 ? Math.min(dx, dy) : 0;
  }
  // The closest point of the box to the disc's centre; inside the disc means they touch.
  const nearestX = Math.max(box.x, Math.min(island.x, box.x + box.width));
  const nearestY = Math.max(box.y, Math.min(island.y, box.y + box.height));
  const distance = Math.hypot(nearestX - island.x, nearestY - island.y);
  return Math.max(0, island.r + reach - distance);
}

/**
 * The islands' names, painted after the marks so a name inside an island stands on its
 * dots rather than under them. Largest first, so the biggest topics keep their names when
 * two would cross.
 */
function drawIslandNames(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame, ink: LibraryGraphInk): void {
  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  const dim = frame.dim ?? 0;
  ctx.font = `${ink.labelPx}px ${ink.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const lineHeight = Math.round(ink.labelPx * 1.35);
  const named = [...(frame.islands ?? [])].sort((a, b) => b.r - a.r);
  for (const island of named) {
    // A topic counts pages; Unread counts files. Locale-grouped like every other count on screen.
    const count = island.kind === "unread" ? island.sources : island.pages;
    const text = `${island.label} · ${count.toLocaleString(frame.locale)}`;
    const width = ctx.measureText(text).width;
    const across = island.band ? island.band.width : island.r * 2;
    // Inside when name and plate fit across the body; the plate adds 4px each side.
    const inside = across >= Math.max(ISLAND_LABEL_INSIDE_MIN_PX, width + 8);
    const box = inside
      ? { x: island.x - width / 2, y: island.y - lineHeight / 2, width, height: lineHeight }
      : placeIslandName(island, width, lineHeight, frame, placed);
    if (!box) continue;
    if (box.x < 2 || box.x + box.width > frame.width - 2 || box.y < 2 || box.y + box.height > frame.height - 2) continue;
    if (placed.some((other) => overlaps(box, other))) continue;
    placed.push(box);
    frame.islandReport?.push(island.id);
    // A ground plate under every name, so it reads off the ground, not the dots.
    const presence = (1 - dim * 0.5) * easeMotion(island.arrival ?? 1);
    ctx.fillStyle = ink.ground;
    ctx.globalAlpha = presence * 0.78;
    ctx.fillRect(box.x - 4, box.y, box.width + 8, box.height);
    ctx.globalAlpha = presence;
    ctx.fillStyle = inside ? ink.labelInk : ink.sourceLabel;
    ctx.fillText(text, box.x + box.width / 2, box.y + box.height / 2);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;
}

/**
 * Hit testing, shared by the pointer and the renderer so a person never highlights one node
 * and selects another.
 */
export function hitTestLibraryGraph(
  frame: Pick<LibraryGraphFrame, "nodes" | "positions" | "radii">,
  point: LayoutPoint,
  /** Extra reach around the mark. The caller widens it for a coarse pointer. */
  reachBonus: number = FINE_HIT_REACH,
  /** The least on-screen radius that is pressable; on the overview a tiny dot is texture and its island takes the press. */
  minRadius = 0,
): LibraryGraphNode | null {
  let best: LibraryGraphNode | null = null;
  let bestDistance = Infinity;
  for (const node of frame.nodes) {
    const centre = frame.positions.get(node.id);
    if (!centre) continue;
    const radius = radiusOf(frame, node);
    // A zero radius is a concept standing for its island on the overview; the island takes the press.
    if (radius <= 0 || radius < minRadius) continue;
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reach = radius + reachBonus;
    if (distance <= reach && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

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

/**
 * Where an unverified citation breaks in the flow picture, as a fraction from the page.
 * Just short of the page, where lines converge, it reads as a stale page; further out the
 * breaks line up into a column of amber.
 */
const FLOW_BREAK_T = 0.12;

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
 * The breathing gap two names keep, wider across than down: side by side two names need a
 * word's space to read as two, while a name stands 5px under its own mark by design.
 */
const NAME_GAP_X = 7;
const NAME_GAP_Y = 2;

/** Screen-space rectangle intersection with the names' breathing gap. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  const padX = NAME_GAP_X;
  const padY = NAME_GAP_Y;
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

const overviewMarkIndices = new WeakMap<LibraryGraphGeometry, {
  nodes: readonly LibraryGraphNode[];
  index: LibraryLabelMarkIndex;
}>();

function overviewMarkIndex(frame: LibraryGraphFrame): LibraryLabelMarkIndex {
  const geometry = frame.overview!.geometry;
  const cached = overviewMarkIndices.get(geometry);
  if (cached?.nodes === frame.nodes) return cached.index;
  const index = new LibraryLabelMarkIndex(frame.nodes, geometry.positions);
  overviewMarkIndices.set(geometry, { nodes: frame.nodes, index });
  return index;
}

const overviewPaths = new WeakMap<LibraryGraphGeometry, {
  nodes: readonly LibraryGraphNode[];
  edges: readonly LibraryGraphEdge[];
  paths: Path2D[];
}>();

function cachedOverviewPaths(frame: LibraryGraphFrame, stalePages: ReadonlySet<string>): Path2D[] {
  const geometry = frame.overview!.geometry;
  const cached = overviewPaths.get(geometry);
  if (cached?.nodes === frame.nodes && cached.edges === frame.edges) return cached.paths;
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (const node of frame.nodes) {
    const point = geometry.positions.get(node.id);
    const radius = geometry.radii.get(node.id) ?? NODE_RADIUS[node.kind];
    if (!point || radius <= 0 || node.kind === "concept") continue;
    const path = paths[node.kind === "source" ? 0 : stalePages.has(node.id) ? 2 : 1];
    if (node.kind === "source") path.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    else {
      path.moveTo(point.x + radius, point.y);
      path.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
  }
  overviewPaths.set(geometry, { nodes: frame.nodes, edges: frame.edges, paths });
  return paths;
}

export function drawLibraryGraph(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): void {
  const { ink } = frame;
  const dim = frame.dim ?? 0;
  const focus = frame.focus ?? null;
  const opacity = frame.opacity;
  /** Full ink, dimmed ink, or somewhere between while the ramp is running. */
  const attention = (id: string): number => {
    // The open page never dims, or pointing elsewhere fades the one mark that says where I am.
    if (id === frame.selectedId) return 1;
    if (dim <= 0 || !focus || focus.has(id)) return 1;
    return 1 - (1 - DIMMED_INK) * dim;
  };
  const alphaOf = (id: string): number => attention(id) * (opacity?.get(id) ?? 1);

  ctx.save();
  ctx.globalAlpha = 1;
  drawGround(ctx, frame);

  if (frame.islands && frame.islands.length > 0) drawIslands(ctx, frame, ink);

  // Edges before marks, so no line crosses the mark it points at. `butt` caps, since
  // round caps add half a width to each dash end and narrow the gaps by a third.
  ctx.lineCap = "butt";
  const active = frame.hoveredId ?? frame.focusedId;
  const flow = frame.flow ?? null;
  for (const edge of frame.edges) {
    const from = nodeCentre(frame, edge.source);
    const to = nodeCentre(frame, edge.target);
    if (!from || !to) continue;
    const touchesSelection =
      frame.selectedId !== null && (edge.source === frame.selectedId || edge.target === frame.selectedId);
    // Pointing at a dot asks about its links, which answer well above the 3:1 floor.
    const touchesActive = active !== null && (edge.source === active || edge.target === active);
    // The overview draws no line at rest, or ten thousand citations become a grey field.
    if (frame.focusEdgesOnly && !touchesSelection && !touchesActive && !(focus?.has(edge.source) && focus?.has(edge.target))) continue;
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
    ctx.lineWidth =
      relationWidth * (touchesSelection ? 1.5 : touchesActive ? 1.33 : 1);
    if (frame.layout === "flow") {
      const [c1, c2] = flowEdgeControls(from, to);
      if (edge.certainty === "unverified") {
        // Two pieces of the curve with a gap at FLOW_BREAK_T.
        const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const half = Math.min(BROKEN_EDGE_GAP, length / 3) / 2 / length;
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

    // Under reduced motion one open chevron on the curve, pointing at the page, keeps the direction.
    if (flow !== null && flow.still && (flow.edges.has(edge.id) || flow.arrivalEdges.has(edge.id))) {
      const at = quadraticAt(from, control, to, FLOW_CHEVRON_T);
      const behind = quadraticAt(from, control, to, FLOW_CHEVRON_T - 0.06);
      const dx = behind.x - at.x;
      const dy = behind.y - at.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
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

  /*
   * The amber dot fills the broken citation's gap, so it reads as about the break. It stands
   * whenever the line is drawn, or the card's "amber dot" sentence names a mark the resting
   * canvas never draws; `pulse` only grows it. The breath is size, never alpha: a translucent
   * dot composites off the warning amber and fails the gate's scan.
   */
  {
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
      if (!from || !to) continue;
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
      ctx.fillStyle = ink.stale;
      ctx.beginPath();
      ctx.arc(middle.x, middle.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // On the overview no line carries the break, so a stale page itself is drawn amber.
  const stalePages = new Set<string>();
  if (frame.layout === "islands") for (const edge of frame.edges) if (edge.certainty === "unverified") stalePages.add(edge.source);
  /*
   * The resting overview paints one path per ink (files, fresh pages, stale pages): the
   * per-mark loop cost 20 ms a frame at 11,240 marks. Any hover, selection, dim or arrival
   * falls back to that loop.
   */
  const quietOverview =
    frame.layout === "islands" &&
    (frame.dim ?? 0) === 0 &&
    frame.selectedId === null &&
    frame.hoveredId === null &&
    frame.focusedId === null &&
    (flow === null || (flow.arrived.size === 0 && flow.edges.size === 0));
  if (quietOverview && frame.overview && (opacity?.size ?? 0) === 0 && typeof Path2D !== "undefined") {
    const paths = cachedOverviewPaths(frame, stalePages);
    const { view } = frame.overview;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(frame.width / 2 - view.x * view.scale, frame.height / 2 - view.y * view.scale);
    ctx.scale(view.scale, view.scale);
    const inks = [ink.source, ink.page, ink.stale];
    for (let i = 0; i < paths.length; i += 1) {
      ctx.fillStyle = inks[i];
      ctx.fill(paths[i]);
    }
    ctx.restore();
  } else if (quietOverview) {
    ctx.globalAlpha = 1;
    const groups: Array<{ ink: string; square: boolean; test: (node: LibraryGraphNode) => boolean }> = [
      { ink: ink.source, square: true, test: (node) => node.kind === "source" },
      { ink: ink.page, square: false, test: (node) => node.kind === "page" && !stalePages.has(node.id) },
      { ink: ink.stale, square: false, test: (node) => node.kind === "page" && stalePages.has(node.id) },
    ];
    for (const group of groups) {
      ctx.beginPath();
      for (const node of frame.nodes) {
        if (!group.test(node)) continue;
        const centre = nodeCentre(frame, node.id);
        if (!centre) continue;
        const radius = radiusOf(frame, node);
        if (radius <= 0) continue;
        if (group.square) ctx.rect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
        else {
          ctx.moveTo(centre.x + radius, centre.y);
          ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = group.ink;
      ctx.fill();
    }
  }
  /*
   * Stateless fading marks share one path per kind, ink and alpha step: one path each cost
   * 25–58 ms a frame when an island of 3,424 marks opened. The loop below skips them.
   */
  const batched = new Set<string>();
  if (opacity && opacity.size > 0 && !quietOverview) {
    const groups = new Map<string, { ink: string; square: boolean; alpha: number; centres: Array<{ x: number; y: number; r: number }> }>();
    for (const node of frame.nodes) {
      const alpha = opacity.get(node.id);
      if (alpha === undefined || alpha >= 1) continue;
      if (node.id === frame.selectedId || node.id === frame.hoveredId || node.id === frame.focusedId) continue;
      if (flow?.arrived.has(node.id)) continue;
      if (node.kind === "source" && node.state === "not-compiled") continue;
      if (node.kind === "concept") continue;
      const centre = nodeCentre(frame, node.id);
      if (!centre) continue;
      const radius = radiusOf(frame, node);
      if (radius <= 0) continue;
      const step = Math.round(attention(node.id) * alpha * 32) / 32;
      const inkFor = node.kind === "page" ? (stalePages.has(node.id) ? ink.stale : ink.page) : ink.source;
      const key = `${node.kind}:${inkFor}:${step}`;
      let group = groups.get(key);
      if (!group) {
        group = { ink: inkFor, square: node.kind === "source", alpha: step, centres: [] };
        groups.set(key, group);
      }
      group.centres.push({ x: centre.x, y: centre.y, r: radius });
      batched.add(node.id);
    }
    for (const group of groups.values()) {
      if (group.alpha <= 0) continue;
      ctx.globalAlpha = group.alpha;
      ctx.fillStyle = group.ink;
      ctx.beginPath();
      for (const centre of group.centres) {
        if (group.square) ctx.rect(centre.x - centre.r, centre.y - centre.r, centre.r * 2, centre.r * 2);
        else {
          ctx.moveTo(centre.x + centre.r, centre.y);
          ctx.arc(centre.x, centre.y, centre.r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  for (const node of frame.nodes) {
    if (quietOverview) break;
    if (batched.has(node.id)) continue;
    const centre = nodeCentre(frame, node.id);
    if (!centre) continue;
    const radius = radiusOf(frame, node);
    // A zero radius is a concept standing for its island: the island is drawn, not it.
    if (radius <= 0) continue;
    const isSelected = node.id === frame.selectedId;
    const isHovered = node.id === frame.hoveredId;
    const isFocused = node.id === frame.focusedId;
    const ownInk = node.kind === "page" ? (stalePages.has(node.id) ? ink.stale : ink.page) : node.kind === "source" ? ink.source : ink.concept;
    const mark = isSelected ? ink.selected : ownInk;

    /*
     * The halo: one flat fill a line width wider than the mark, so lines stop at the dot and
     * hollow marks show ground. A page uses `--graph-page-halo`, or its many meeting lines cut
     * a hole around it. Never a glow: no colour spreads and nothing animates.
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
        // Hollow: a positive mark for "not written up", not read out of a missing line.
        ctx.strokeStyle = mark;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
      } else {
        ctx.fillStyle = mark;
        ctx.fillRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
      }
    } else if (node.kind === "concept") {
      // Hollow: the ground showing through says "not a file in your folder".
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

    /*
     * A just-written page brightens to the selection indigo and decays over its arrival
     * while its citations drift toward it; both end with the receipt's trail
     * (`docs/DECISIONS.md`, "A press on a Library mark opens a card beside it").
     */
    const arrival = flow?.arrived.get(node.id);
    if (arrival !== undefined) {
      ctx.globalAlpha = alphaOf(node.id) * (1 - Math.min(1, Math.max(0, arrival))) * 0.65;
      ctx.beginPath();
      ctx.fillStyle = ink.selected;
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alphaOf(node.id);
    }

    if (isSelected) {
      ctx.beginPath();
      ctx.strokeStyle = ink.selectedRing;
      ctx.lineWidth = 1;
      ctx.arc(centre.x, centre.y, radius + SELECTION_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isHovered) {
      // Pointing is not choosing: a neutral dotted ring, so hover never differs by colour alone.
      ctx.beginPath();
      ctx.setLineDash([1, 2]);
      ctx.strokeStyle = ink.hoverRing;
      ctx.lineWidth = 1;
      ctx.arc(centre.x, centre.y, radius + SELECTION_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The keyboard's ring sits outside both, since a focused node may also be selected.
    if (isFocused) {
      ctx.beginPath();
      ctx.strokeStyle = ink.selectedRing;
      ctx.lineWidth = 2;
      ctx.arc(centre.x, centre.y, radius + FOCUS_RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  if (frame.islands && frame.islands.length > 0) drawIslandNames(ctx, frame, ink);

  drawActivityMarks(ctx, frame);

  /*
   * Names are semantic, not thresholded: a page always carries its name, the quieter page
   * losing a collision; a file or concept only when zoomed past `SOURCE_LABEL_MIN_SCALE`,
   * pointed at or in the open page's neighbourhood. Losers are hidden, never overlapped.
   * Greedy in a fixed order against boxes already taken, marks included:
   * O(names × placed boxes), deterministic across draws and machines.
   */
  if (frame.standingLabels || frame.layout === "flow") {
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    /*
     * Asked in order of focus, then kind (page, source, concept), then size largest first,
     * then graph order. The greedy pass gives the room to whoever asks first, so without the
     * focus key a narrow canvas names only dimmed marks and leaves the open page anonymous.
     */
    const order: LibraryGraphNodeKind[] = ["page", "source", "concept"];
    const rank = (node: LibraryGraphNode): number => {
      const near = !focus || focus.has(node.id) || node.id === frame.selectedId ? 0 : 1;
      return near * order.length + order.indexOf(node.kind);
    };
    /** Whether a file's or a concept's name exists on this frame at all. */
    const carriesName = (node: LibraryGraphNode): boolean => {
      if (node.kind === "page") return frame.pageLabels ?? true;
      if (node.kind === "concept" ? (frame.conceptLabels ?? frame.sourceLabels) : frame.sourceLabels) return true;
      if (node.id === frame.selectedId || node.id === active) return true;
      return focus !== null && focus.has(node.id);
    };
    const named: Array<{ node: LibraryGraphNode; index: number; priority: number; radius: number; x: number; y: number }> = [];
    for (let index = 0; index < frame.nodes.length; index += 1) {
      const node = frame.nodes[index];
      if (node.id === active || !carriesName(node)) continue;
      const centre = nodeCentre(frame, node.id);
      if (!centre) continue;
      const radius = radiusOf(frame, node);
      const lineHeight = Math.round(labelFontPx(ink, node.kind) * 1.35);
      const reach = Math.abs(radius) + STANDING_LABEL_GAP + Math.abs(lineHeight);
      if (frame.nodes.length > LEADER_MAX_MARKS &&
        (centre.y + reach < 2 || centre.y - reach > frame.height - 2)) continue;
      named.push({ node, index, priority: rank(node), radius, x: centre.x, y: centre.y });
    }
    named.sort(
      (first, second) =>
        first.priority - second.priority ||
        second.radius - first.radius ||
        first.index - second.index,
    );
    const taken: Array<{ x: number; y: number; width: number; height: number; of?: string }> = [];
    const overview = frame.overview;
    const indexed = named.length > 0 && overview && frame.layout !== "flow" &&
      Number.isFinite(overview.view.x) && Number.isFinite(overview.view.y) &&
      Number.isFinite(overview.view.scale) && overview.view.scale > 0 && frame.nodes.length > 256
      ? overviewMarkIndex(frame) : null;
    let maxRadius = Math.max(...Object.values(NODE_RADIUS));
    if (indexed) {
      for (const radius of frame.radii?.values() ?? []) maxRadius = Math.max(maxRadius, Math.abs(radius));
    } else if (named.length > 0) {
      for (const node of frame.nodes) {
        const centre = nodeCentre(frame, node.id);
        if (!centre) continue;
        const half = radiusOf(frame, node);
        taken.push({ x: centre.x - half, y: centre.y - half, width: half * 2, height: half * 2, of: node.id });
      }
    }
    const hitsMark = (box: { x: number; y: number; width: number; height: number }, own: string): boolean => {
      if (!indexed || !overview) return false;
      const view = overview.view;
      const marginX = NAME_GAP_X + maxRadius;
      const marginY = NAME_GAP_Y + maxRadius;
      const left = view.x + (box.x - marginX - frame.width / 2) / view.scale;
      const right = view.x + (box.x + box.width + marginX - frame.width / 2) / view.scale;
      const top = view.y + (box.y - marginY - frame.height / 2) / view.scale;
      const bottom = view.y + (box.y + box.height + marginY - frame.height / 2) / view.scale;
      const tolerance = Math.max(1e-7, Math.max(Math.abs(left), Math.abs(right), Math.abs(top), Math.abs(bottom)) * Number.EPSILON * 16);
      return indexed.some(left - tolerance, top - tolerance, right + tolerance, bottom + tolerance, (node) => {
        const id = node.id;
        if (id === own) return false;
        const centre = nodeCentre(frame, id);
        if (!centre) return false;
        const half = radiusOf(frame, node);
        return overlaps(box, { x: centre.x - half, y: centre.y - half, width: half * 2, height: half * 2 });
      });
    };
    const coverage = named.length > 256 ? LibraryLabelCoverage.create(frame.width, frame.height) : null;
    if (coverage) {
      for (const { node, radius, x, y } of named) {
        const left = x - radius, top = y - radius, size = radius * 2;
        coverage.add(node.id, left - NAME_GAP_X, top - NAME_GAP_Y,
          left + size + NAME_GAP_X, top + size + NAME_GAP_Y);
      }
    }
    const openLine = (x: number, y: number, height: number, own: string): boolean => {
      if (x < 2 || x > frame.width - 2 || y < 2 || y + height > frame.height - 2) return false;
      if (coverage?.blocksLine(x, y, height)) return false;
      const box = { x, y, width: 0, height };
      return !taken.some(other => other.of !== own && overlaps(box, other)) && !hitsMark(box, own);
    };
    for (const { node, radius: half, x, y } of named) {
      const centre = { x, y };
      const fontPx = labelFontPx(ink, node.kind);
      const lineHeight = Math.round(fontPx * 1.35);
      if (named.length > 256 && frame.nodes.length > LEADER_MAX_MARKS) {
        const middle = Math.min(Math.max(2, centre.x), Math.max(2, frame.width - 2));
        const possible = openLine(middle, centre.y + half + STANDING_LABEL_GAP, lineHeight, node.id) ||
          openLine(middle, centre.y - half - STANDING_LABEL_GAP - lineHeight, lineHeight, node.id) ||
          openLine(centre.x + half + STANDING_LABEL_GAP, centre.y - lineHeight / 2, lineHeight, node.id) ||
          openLine(centre.x - half - STANDING_LABEL_GAP, centre.y - lineHeight / 2, lineHeight, node.id);
        if (!possible) continue;
      }
      // Font per kind before measuring, so the tested box matches the drawn step.
      ctx.font = `${fontPx}px ${ink.fontFamily}`;
      // The column's room, else the flat budget; the canvas is still the outer bound.
      const roomCap = frame.flowLabelRoom?.[node.kind] ?? STANDING_LABEL_MAX_WIDTH;
      let text = truncateToWidth(
        ctx,
        middleEllipsis(node.label, STANDING_LABEL_MAX_CHARS),
        Math.min(Math.max(roomCap, STANDING_LABEL_MAX_WIDTH), frame.width - 8),
      );
      if (!text) continue;
      let width = ctx.measureText(text).width;
      /*
       * Four places, first free wins: under (read without a hint of which dot), over, right,
       * left; one place alone named 8 of 60 pages on the 372-mark fixture. A name near an
       * edge slides back inside, since the fit puts marks against both edges by design.
       */
      /*
       * In the flow picture a page's or concept's name shortens to the room before the next
       * box on its line rather than leave its side, where it would cover the rows below;
       * under {@link STANDING_LABEL_MIN_PX} the four places take over.
       */
      if (frame.layout === "flow" && node.kind !== "source") {
        const startX = centre.x + half + STANDING_LABEL_GAP;
        const lineTop = centre.y - lineHeight / 2;
        let room = frame.width - 2 - startX;
        // The same gaps `overlaps` tests with, or the cut name still loses its side.
        for (const other of taken) {
          if (other.of === node.id || other.x < startX) continue;
          if (other.y + other.height + NAME_GAP_Y <= lineTop || other.y - NAME_GAP_Y >= lineTop + lineHeight) continue;
          room = Math.min(room, other.x - NAME_GAP_X - startX);
        }
        if (width > room && room >= STANDING_LABEL_MIN_PX) {
          text = truncateToWidth(ctx, text, room);
          if (!text) continue;
          width = ctx.measureText(text).width;
        }
      }
      const centred = Math.min(
        Math.max(2, centre.x - width / 2),
        Math.max(2, frame.width - 2 - width),
      );
      const under = { x: centred, y: centre.y + half + STANDING_LABEL_GAP };
      const over = { x: centred, y: centre.y - half - STANDING_LABEL_GAP - lineHeight };
      const right = { x: centre.x + half + STANDING_LABEL_GAP, y: centre.y - lineHeight / 2 };
      const left = { x: centre.x - half - STANDING_LABEL_GAP - width, y: centre.y - lineHeight / 2 };
      /*
       * In columns a name stands on the side its column keeps clear (`FLOW_LABEL_ROOM_PX`):
       * a file's left, a page's or concept's right. Under would sit on the next row's edges.
       */
      const candidates =
        frame.layout === "flow"
          ? node.kind === "source"
            ? [left, right, under, over]
            : [right, left, under, over]
          : [under, over, right, left];
      /*
       * A name that loses all four places is pushed out on a leader rather than deleted, since
       * nobody asks an anonymous dot for its name. Rings of spokes grow to
       * {@link LEADER_REACH_MAX}; past that a name belongs to nothing and is dropped.
       */
      for (let step = 1; frame.nodes.length <= LEADER_MAX_MARKS && step <= LEADER_STEPS; step += 1) {
        const reach = half + STANDING_LABEL_GAP + (LEADER_REACH_MAX / LEADER_STEPS) * step;
        for (let spoke = 0; spoke < LEADER_SPOKES; spoke += 1) {
          // From below the mark round, a fixed order near where a reader looks first.
          const angle =
            Math.PI / 2 +
            (step - 1) * LEADER_RING_ROTATION +
            (spoke * 2 * Math.PI) / LEADER_SPOKES;
          const at = { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach };
          // Slid back inside the frame, as the four base places are.
          candidates.push({
            x: Math.min(Math.max(2, at.x - width / 2), Math.max(2, frame.width - 2 - width)),
            y: at.y - lineHeight / 2,
          });
        }
      }
      let box: { x: number; y: number; width: number; height: number } | null = null;
      let placement = 0;
      for (const [index, candidate] of candidates.entries()) {
        const tried = { x: candidate.x, y: candidate.y, width, height: lineHeight };
        if (tried.y < 2 || tried.y + tried.height > frame.height - 2) continue;
        if (tried.x < 2 || tried.x + tried.width > frame.width - 2) continue;
        if (taken.some((other) => other.of !== node.id && overlaps(tried, other)) || hitsMark(tried, node.id)) continue;
        box = tried;
        placement = index;
        break;
      }
      if (!box) continue;
      taken.push(box);
      // A hairline leader only past the four base places; a label touching its dot needs none.
      if (placement >= 4) {
        const anchor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const away = Math.hypot(anchor.x - centre.x, anchor.y - centre.y) || 1;
        const unit = { x: (anchor.x - centre.x) / away, y: (anchor.y - centre.y) / away };
        const stop = Math.max(0, away - Math.max(box.width, box.height) / 2 - 2);
        ctx.globalAlpha = alphaOf(node.id);
        ctx.strokeStyle = node.kind === "page" ? ink.page : ink.sourceLabel;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(centre.x + unit.x * (half + 1), centre.y + unit.y * (half + 1));
        ctx.lineTo(centre.x + unit.x * stop, centre.y + unit.y * stop);
        ctx.stroke();
      }
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
      // A name dims with its mark.
      ctx.globalAlpha = alphaOf(node.id);
      // A ground outline stroked before the fill, so crossing lines never cut the glyphs.
      ctx.strokeStyle = ink.ground;
      ctx.lineWidth = labelOutlinePx() * 2;
      ctx.lineJoin = "round";
      ctx.strokeText(text, box.x + box.width / 2, box.y);
      /*
       * A name is one step brighter than its mark: a source's mark ink is also the edge ink,
       * so file and concept names take `--color-text-tertiary`; a page keeps the page ink.
       */
      ctx.fillStyle = node.kind === "page" ? ink.page : ink.sourceLabel;
      // From the box, not the centre: a slid label is no longer centred on its dot.
      ctx.fillText(text, box.x + box.width / 2, box.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // The one label beside the pointed-at node.
  const activeNode = active ? frame.nodes.find((node) => node.id === active) ?? null : null;
  const activeCentre = active ? nodeCentre(frame, active) : null;
  if (activeNode && activeCentre && frame.activeLabel) {
    ctx.font = `${ink.labelPx}px ${ink.fontFamily}`;
    ctx.textBaseline = "middle";
    // Truncated to the canvas before placing, or a long name runs off a narrow canvas.
    const maxBoxWidth = Math.max(LABEL_PAD_X * 2, frame.width - 4);
    const text = truncateToWidth(ctx, frame.activeLabel, maxBoxWidth - LABEL_PAD_X * 2);
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + LABEL_PAD_X * 2;
    const boxHeight = ink.labelPx + LABEL_PAD_Y * 2;
    // Clearance from the mark's ring edge, not its centre, or the box covers the ring; the
    // box flips sides rather than leave the canvas.
    const clearance = radiusOf(frame, activeNode) + SELECTION_RING_GAP + LABEL_GAP;
    let x = activeCentre.x + clearance;
    if (x + boxWidth > frame.width - 2) x = activeCentre.x - clearance - boxWidth;
    if (x < 2) x = 2;
    // Clamp both edges: flipping a box wider than the clearance only changes which edge it leaves.
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
 * Fits `text` to `maxWidth`. A file name is shortened in the middle, because its tail (a
 * date, a number, an extension) tells two marks apart and cutting it gives two marks one
 * name. The tail grows glyph by glyph to a third of the budget; the head is a binary search.
 * Returns `""` only when even the ellipsis does not fit.
 */
function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  // A phrase is cut off the end at a word boundary, as in `middleEllipsis`.
  if (text.includes(" ")) {
    const head = headThatFits(ctx, text, maxWidth - ctx.measureText(ellipsis).width);
    const lastSpace = head.lastIndexOf(" ");
    const cut = lastSpace > head.length / 2 ? head.slice(0, lastSpace) : head;
    return `${cut.trimEnd()}${ellipsis}`;
  }
  // The tail is the shorter part, or the name reads as two fragments.
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
    return `${headThatFits(ctx, text, maxWidth - ctx.measureText(ellipsis).width)}${ellipsis}`;
  }
  const head = headThatFits(ctx, text, maxWidth - ctx.measureText(suffix).width);
  return `${head}${suffix}`;
}

/**
 * The character cap: a file name (no spaces) loses its middle, keeping the distinguishing
 * tail; a phrase is cut at the last word boundary that fits, since a middle ellipsis
 * through a sentence halves words at both ends.
 */
function middleEllipsis(text: string, maxChars: number): string {
  const glyphs = [...text];
  if (glyphs.length <= maxChars) return text;
  const keep = maxChars - 1;
  if (text.includes(" ")) {
    const head = glyphs.slice(0, keep).join("");
    const lastSpace = head.lastIndexOf(" ");
    // Snap to a word boundary only when a word survives; an overlong first word is cut, not erased.
    const cut = lastSpace > keep / 2 ? head.slice(0, lastSpace) : head;
    return `${cut.trimEnd()}…`;
  }
  // The tail keeps a third after the ellipsis, the same split as `truncateToWidth`.
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
