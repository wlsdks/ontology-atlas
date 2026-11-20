import { BoxGrid } from "./library-box-grid";
import { CITES_WIDTH, NODE_RADIUS, nodeCentre, radiusOf } from "./library-graph-marks";
import { drawStandingNames, NAME_GAP_X, NAME_GAP_Y, overlaps, truncateToWidth } from "./library-standing-names";
import type {
  LibraryGraphEdge,
  LibraryGraphNode,
  LibraryGraphNodeKind,
} from "../model/build-library-graph";
import { easeMotion, type LayoutPoint } from "../model/library-graph-layout";
import type { LibraryPositionLookup } from "../model/library-graph-view";
import { drawLibraryEdges, drawStaleDots, libraryEdgeWidth } from "./library-graph-edges";
import type { LibraryGraphInk } from "./library-graph-ink";

export { CITES_WIDTH, NODE_RADIUS };
export { edgeControlPoint, STALE_DOT_STANDING_MAX } from "./library-graph-edges";

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
 * | describes | solid, 1px: plain, what the page is about |
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
  /**
   * Marks or the camera move on this frame and the engine paints another after it. Standing
   * names then ride their marks from the last still frame, and the next still frame places them.
   */
  moving?: boolean;
  /** Names appear and leave at once instead of fading. */
  reducedMotion?: boolean;
  /** `flow`: columns, edges drawn as horizontal S-curves; `force`: the bowed quadratic; `islands`: the overview. */
  layout?: "flow" | "force" | "islands";
  /**
   * Per kind, in screen px, the `labelRoom` a flow column settled on, which a name is cut to;
   * absent means the flat `STANDING_LABEL_MAX_WIDTH` and character caps.
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
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 4;
const LABEL_GAP = 6;
const LABEL_RADIUS = 4;
/** Pointer slop around a mark for a mouse. A 5px square is smaller than any pointer. */
const FINE_HIT_REACH = 4;

/** The ground each mark clears around itself, as a ratio of the widest line it clears. */
const MARK_HALO_RATIO = 1;
/**
 * The ground: one flat fill of the app surface (`docs/DESIGN-SYSTEM.md`). No grid: graph
 * paper sets a rhythm no relation in the folder corresponds to.
 */
function drawGround(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): void {
  ctx.fillStyle = frame.ink.ground;
  ctx.fillRect(0, 0, frame.width, frame.height);
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
  placed: BoxGrid<{ x: number; y: number; width: number; height: number }>,
  islands: BoxGrid<LibraryGraphIsland>,
  /** Set when the canvas edge refused a seat. */
  clip: { edge: boolean },
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
  let fallback: { seat: (typeof seats)[number]; cover: number } | null = null;
  for (const seat of seats) {
    if (seat.x < 2 || seat.x + seat.width > frame.width - 2 || seat.y < 2 || seat.y + seat.height > frame.height - 2) {
      clip.edge = true;
      continue;
    }
    if (placed.some(seat, Math.max(NAME_GAP_X, NAME_GAP_Y), (other) => overlaps(seat, other))) continue;
    // A seat stops counting once it can no longer win: past the reach a name may take, or no better than the seat in hand.
    const limit = Math.min(ISLAND_NAME_REACH_MAX_PX, fallback ? fallback.cover : Infinity);
    let cover = 0;
    const lost = islands.some(seat, ISLAND_SHORE_PX, (other) => {
      if (other.id !== island.id) cover += islandCover(seat, other);
      return cover > limit || (fallback !== null && cover >= fallback.cover);
    });
    if (lost) continue;
    if (cover === 0) return seat;
    if (!fallback || cover < fallback.cover) fallback = { seat, cover };
  }
  return fallback && fallback.cover <= ISLAND_NAME_REACH_MAX_PX ? fallback.seat : null;
}

/** Pages with a stale citation, per edge list: the overview asks every frame, the edges change only with the folder. */
const stalePageSets = new WeakMap<readonly LibraryGraphEdge[], Set<string>>();
function stalePagesOf(edges: readonly LibraryGraphEdge[]): Set<string> {
  let pages = stalePageSets.get(edges);
  if (!pages) {
    pages = new Set();
    for (const edge of edges) if (edge.certainty === "unverified") pages.add(edge.source);
    stalePageSets.set(edges, pages);
  }
  return pages;
}

/** The screen cell the name pass buckets islands and names on, in CSS px. */
const NAME_GRID_PX = 48;

/**
 * Each island's name and its width, kept while label, count, locale and font hold: formatting
 * a count and measuring its text for thousands of islands a frame were most of the name pass.
 */
const islandNames = new Map<string, { label: string; count: number; locale: string | undefined; font: string; text: string; width: number }>();
function islandName(ctx: CanvasRenderingContext2D, font: string, island: LibraryGraphIsland, locale: string | undefined): { text: string; width: number } {
  // A topic counts pages; Unread counts files. Locale-grouped like every other count on screen.
  const count = island.kind === "unread" ? island.sources : island.pages;
  const held = islandNames.get(island.id);
  if (held && held.label === island.label && held.count === count && held.locale === locale && held.font === font) return held;
  if (islandNames.size > 20_000) islandNames.clear();
  const text = `${island.label} · ${count.toLocaleString(locale)}`;
  const name = { label: island.label, count, locale, font, text, width: ctx.measureText(text).width };
  islandNames.set(island.id, name);
  return name;
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

type NameBox = { x: number; y: number; width: number; height: number };

/** Where each island's name sat at the last full seating, relative to the island, and where the island stood. */
interface NameSeating {
  key: string;
  seats: Map<string, { x: number; y: number; r: number; seat: { dx: number; dy: number; inside: boolean } | null; edge: boolean }>;
  /** Ids in drawing order: largest first, then islands seated since. */
  order: string[];
  sinceFull: number;
}

/** The last seating per canvas. */
const nameSeatings = new WeakMap<CanvasRenderingContext2D, NameSeating>();
/** Islands that moved apart by less than this since the seating keep their seats: a pan or a hover moves none. */
const SEAT_DRIFT_PX = 1;
/** While many islands move apart, names are seated afresh every this many frames and follow their islands between. */
const RESEAT_EVERY_FRAMES = 3;
/** Up to this share of the islands in view may move (a hand carrying one shoves its neighbours) and only theirs are seated again. */
const RESEAT_FEW_SHARE = 0.1;

/**
 * The islands' names, painted after the marks so a name inside an island stands on its
 * dots rather than under them. Largest first, so the biggest topics keep their names when
 * two would cross.
 *
 * Seating costs O(k) grid queries; a frame whose islands only moved together (a pan, a hover)
 * reuses the last seating at O(k log k) (the median shift) and seats only islands that came
 * into view, moved on their own, or now stand under a kept name.
 */
function drawIslandNames(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame, ink: LibraryGraphInk): void {
  const extentOf = (island: LibraryGraphIsland) => {
    const halfW = (island.band ? island.band.width / 2 : island.r) + ISLAND_SHORE_PX;
    const halfH = (island.band ? island.band.height / 2 : island.r) + ISLAND_SHORE_PX;
    return { left: island.x - halfW, top: island.y - halfH, right: island.x + halfW, bottom: island.y + halfH };
  };
  const all = frame.islands ?? [];
  const visible: LibraryGraphIsland[] = [];
  for (const island of all) {
    const { left, top, right, bottom } = extentOf(island);
    // Off the canvas an island can neither carry a name nor be covered by one.
    if (right < 0 || bottom < 0 || left > frame.width || top > frame.height) continue;
    visible.push(island);
  }
  const font = `${ink.labelPx}px ${ink.fontFamily}`;
  ctx.font = font;
  const lineHeight = Math.round(ink.labelPx * 1.35);
  const key = `${frame.width}|${frame.height}|${font}|${frame.locale ?? ""}|${all.length}|${all[0]?.id ?? ""}|${all.at(-1)?.id ?? ""}`;
  let seating = nameSeatings.get(ctx);
  let shift: { x: number; y: number } | null = null;
  /** Islands that moved apart from the rest since their seat was taken. */
  const movers = new Set<string>();
  if (seating && seating.key === key) {
    let zoomed = false;
    const dx: number[] = [];
    const dy: number[] = [];
    for (const island of visible) {
      const held = seating.seats.get(island.id);
      if (!held) continue;
      // A zoom changes every size: the seats no longer fit.
      if (Math.abs(held.r - island.r) > 0.5) {
        zoomed = true;
        break;
      }
      dx.push(island.x - held.x);
      dy.push(island.y - held.y);
    }
    // The map's own shift is the median one, so an island a hand carries does not count as the map.
    const median = (values: number[]) => (values.length === 0 ? 0 : Float64Array.from(values).sort()[values.length >> 1]);
    shift = { x: median(dx), y: median(dy) };
    if (!zoomed) {
      for (const island of visible) {
        const held = seating.seats.get(island.id);
        if (held && (Math.abs(island.x - held.x - shift.x) > SEAT_DRIFT_PX || Math.abs(island.y - held.y - shift.y) > SEAT_DRIFT_PX)) movers.add(island.id);
      }
    }
    seating.sinceFull += 1;
    const many = movers.size > Math.max(16, visible.length * RESEAT_FEW_SHARE);
    if (zoomed || (many && seating.sinceFull >= RESEAT_EVERY_FRAMES)) shift = null;
    // Many moving: names follow their islands until the next full seating.
    else if (many) movers.clear();
  }
  const placed = new BoxGrid<NameBox>(NAME_GRID_PX, (box) => ({
    left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height,
  }));
  let bodies: BoxGrid<LibraryGraphIsland> | null = null;
  const bodiesGrid = () => {
    if (!bodies) {
      bodies = new BoxGrid<LibraryGraphIsland>(NAME_GRID_PX, extentOf);
      for (const island of visible) bodies.add(island);
    }
    return bodies;
  };
  const drawn: Array<{ island: LibraryGraphIsland; box: NameBox; inside: boolean; text: string }> = [];
  const inCanvas = (box: NameBox) => box.x >= 2 && box.x + box.width <= frame.width - 2 && box.y >= 2 && box.y + box.height <= frame.height - 2;
  const seat = (island: LibraryGraphIsland, into: NameSeating, at: { x: number; y: number }) => {
    const { text, width } = islandName(ctx, font, island, frame.locale);
    const across = island.band ? island.band.width : island.r * 2;
    // Inside when name and plate fit across the body; the plate adds 4px each side.
    const inside = across >= Math.max(ISLAND_LABEL_INSIDE_MIN_PX, width + 8);
    const clip = { edge: false };
    const box = inside
      ? { x: island.x - width / 2, y: island.y - lineHeight / 2, width, height: lineHeight }
      : placeIslandName(island, width, lineHeight, frame, placed, bodiesGrid(), clip);
    const free = box !== null && inCanvas(box) && !placed.some(box, Math.max(NAME_GAP_X, NAME_GAP_Y), (other) => overlaps(box, other));
    into.seats.set(island.id, {
      x: at.x, y: at.y, r: island.r,
      seat: free ? { dx: box.x - island.x, dy: box.y - island.y, inside } : null,
      // A name the canvas edge refused may fit once the island comes further in.
      edge: clip.edge || (box !== null && !inCanvas(box)),
    });
    if (!free) return;
    placed.add(box);
    drawn.push({ island, box, inside, text });
  };
  if (seating && shift) {
    const byId = new Map(visible.map((island) => [island.id, island]));
    const moved = visible.filter((island) => movers.has(island.id));
    // A kept name a moving island now stands under is seated again too.
    const under = (box: NameBox) => moved.some((island) => {
      const { left, top, right, bottom } = extentOf(island);
      return box.x < right && box.x + box.width > left && box.y < bottom && box.y + box.height > top;
    });
    for (const id of seating.order) {
      const island = byId.get(id);
      const held = seating.seats.get(id);
      if (!island || !held?.seat || movers.has(id)) continue;
      const { text, width } = islandName(ctx, font, island, frame.locale);
      const box = { x: island.x + held.seat.dx, y: island.y + held.seat.dy, width, height: lineHeight };
      if (moved.length > 0 && under(box)) {
        movers.add(id);
        continue;
      }
      if (!inCanvas(box)) continue;
      placed.add(box);
      drawn.push({ island, box, inside: held.seat.inside, text });
    }
    // Islands that came into view, moved on their own, or whose name the edge refused, are seated among the names in place.
    const fresh = visible.filter((island) => {
      const held = seating!.seats.get(island.id);
      return !held || movers.has(island.id) || (!held.seat && held.edge);
    });
    fresh.sort((a, b) => b.r - a.r);
    for (const island of fresh) {
      if (!seating.seats.has(island.id)) seating.order.push(island.id);
      seat(island, seating, { x: island.x - shift.x, y: island.y - shift.y });
    }
  } else {
    seating = { key, seats: new Map(), order: [], sinceFull: 0 };
    nameSeatings.set(ctx, seating);
    const named = [...visible].sort((a, b) => b.r - a.r);
    for (const island of named) {
      seating.order.push(island.id);
      seat(island, seating, island);
    }
  }
  const dim = frame.dim ?? 0;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (const { island, box, inside, text } of drawn) {
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
    // Size first: on the overview most dots are too small to press, and a position is projected on demand.
    const radius = radiusOf(frame, node);
    // A zero radius is a concept standing for its island on the overview; the island takes the press.
    if (radius <= 0 || radius < minRadius) continue;
    const centre = frame.positions.get(node.id);
    if (!centre) continue;
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

/** Paints one frame; returns whether a standing name is still fading in or out, so the caller paints again. */
export function drawLibraryGraph(ctx: CanvasRenderingContext2D, frame: LibraryGraphFrame): boolean {
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

  // `butt` caps, since round caps add half a width to each dash end and narrow the gaps by a third.
  ctx.lineCap = "butt";
  drawLibraryEdges(ctx, frame, alphaOf);
  drawStaleDots(ctx, frame, alphaOf);
  const active = frame.hoveredId ?? frame.focusedId;
  const flow = frame.flow ?? null;

  // On the overview no line carries the break, so a stale page itself is drawn amber.
  const stalePages = frame.layout === "islands" ? stalePagesOf(frame.edges) : new Set<string>();
  /*
   * The resting overview paints one path per ink (files, fresh pages, stale pages): the
   * per-mark loop cost 20 ms a frame at 11,240 marks. Any hover, selection or dim falls back
   * to that loop.
   */
  const quietOverview =
    frame.layout === "islands" &&
    (frame.dim ?? 0) === 0 &&
    frame.selectedId === null &&
    frame.hoveredId === null &&
    frame.focusedId === null &&
    (flow === null || (flow.arrived.size === 0 && flow.edges.size === 0));
  // Both quiet paths draw every mark at full ink, so a fade-in's opacities take the cached one too.
  if (quietOverview && frame.overview && typeof Path2D !== "undefined") {
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
  const markPadding = Math.max(libraryEdgeWidth("cites") * MARK_HALO_RATIO,
    SELECTION_RING_GAP + 0.5, FOCUS_RING_GAP + 1) + 2;
  for (const node of frame.nodes) {
    if (quietOverview) break;
    if (batched.has(node.id)) continue;
    const centre = nodeCentre(frame, node.id);
    if (!centre) continue;
    const radius = radiusOf(frame, node);
    // A zero radius is a concept standing for its island: the island is drawn, not it.
    if (radius <= 0) continue;
    const extent = radius + markPadding;
    if (centre.x + extent < 0 || centre.x - extent > frame.width ||
      centre.y + extent < 0 || centre.y - extent > frame.height) continue;
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

  let namesFading = false;
  if (frame.standingLabels || frame.layout === "flow") {
    namesFading = drawStandingNames(ctx, frame, active, focus, alphaOf);
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
  return namesFading;
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
