import type { LibraryGraphNode, LibraryGraphNodeKind } from "../model/build-library-graph";
import type { LibraryGraphFrame, LibraryGraphGeometry } from "./draw-library-graph";
import { BoxGrid } from "./library-box-grid";
import { CITES_WIDTH, NODE_RADIUS, nodeCentre, radiusOf } from "./library-graph-marks";
import type { LibraryGraphInk } from "./library-graph-ink";
import { LibraryLabelCoverage } from "./library-label-coverage";
import { LibraryLabelMarkIndex } from "./library-label-mark-index";
import { LibraryLabelOccupancy } from "./library-label-occupancy";

/**
 * Two ramp steps: `--text-label` for a page's name, `--text-caption` for a file's or a
 * concept's. A larger page step makes names collide and the placement pass hide a third of
 * them at three hundred documents. The hover box keeps the label step for every kind.
 */
function labelFontPx(ink: LibraryGraphInk, kind: LibraryGraphNodeKind): number {
  return kind === "page" ? ink.pageLabelPx : ink.captionPx;
}
/** The least a shortened name may be, on screen, to still be a name: about six glyphs. */
const STANDING_LABEL_MIN_PX = 48;
/** Gap between a mark and the name standing under it. */
const STANDING_LABEL_GAP = 5;

/** Without a flow column's room no standing name is wider than this; past it a name is truncated. */
const STANDING_LABEL_MAX_WIDTH = 132;
/**
 * The longest name in characters, applied before the pixel cap, which alone cuts Latin and
 * Hangul at very different lengths. At 24 a file's stem and extension both survive.
 */
const STANDING_LABEL_MAX_CHARS = 24;
/**
 * Leader search: reach, steps and spokes for pushing a name off its mark, each ring rotated by the
 * golden angle. Past 44px a name no longer reads as that dot's; four steps on twelve spokes sufficed.
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

/**
 * Half-width of the ground outline stroked under every standing name, in CSS px. It must
 * clear {@link CITES_WIDTH}: name and edge inks are 1.17:1 apart, so only clearance
 * separates a crossing line from the glyphs. Stroked under the glyph, never a glow.
 */
const LABEL_OUTLINE_PX = 2;

/** The clearance a name needs is the width of what crosses it: one citation width, floored. */
function labelOutlinePx(): number {
  return Math.max(LABEL_OUTLINE_PX, CITES_WIDTH + 0.5);
}

/**
 * The breathing gap two names keep, wider across than down: side by side two names need a
 * word's space to read as two, while a name stands 5px under its own mark by design.
 */
export const NAME_GAP_X = 7;
export const NAME_GAP_Y = 2;

/** Screen-space rectangle intersection with the names' breathing gap. */
export function overlaps(
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

/** The screen cell placed names and marks are bucketed on, in CSS px: about one line of a name tall. */
const STANDING_NAME_GRID_PX = 16;
/** Past this many candidate names a placement builds its crowd rasters and pre-checks each place. */
const STANDING_NAME_CROWD_MIN = 256;

type ScreenBox = { x: number; y: number; width: number; height: number };

/** A standing name where the placement put it; drawing needs nothing else. */
interface StandingName {
  node: LibraryGraphNode;
  text: string;
  box: ScreenBox;
  fontPx: number;
  /** The mark a name pushed past its four base places points back to on a leader. */
  leaderFrom: { x: number; y: number; half: number } | null;
}

/** Each canvas keeps one raster, cleared per placement rather than allocated again. */
const occupancyByCanvas = new WeakMap<CanvasRenderingContext2D, LibraryLabelOccupancy>();

/** Per mark, in `frame.nodes` order: whether it has a centre, then its centre's x and y, then its radius. */
const MARK_SLOTS = 4;

/** The last placement per canvas, with the frame values and the per-mark centre and radius it read. */
const standingNamesMemo = new WeakMap<CanvasRenderingContext2D, {
  inputs: unknown[];
  marks: Float64Array;
  names: StandingName[];
}>();

/**
 * The frame's standing names, placed again only when something the placement reads changed, so
 * a frame that only fades, dims or moves dashes draws the last placement. O(marks) to check.
 */
export function standingNames(
  ctx: CanvasRenderingContext2D,
  frame: LibraryGraphFrame,
  active: string | null,
  focus: ReadonlySet<string> | null,
): StandingName[] {
  const room = frame.flowLabelRoom;
  const view = frame.overview?.view;
  const inputs: unknown[] = [
    frame.nodes, frame.width, frame.height, frame.ink, frame.layout, frame.standingLabels,
    frame.pageLabels, frame.sourceLabels, frame.conceptLabels, room?.page, room?.source, room?.concept,
    frame.selectedId, active, focus, focus?.size, frame.overview?.geometry, view?.x, view?.y, view?.scale,
  ];
  const memo = standingNamesMemo.get(ctx);
  const length = frame.nodes.length * MARK_SLOTS;
  const marks = memo && memo.marks.length === length ? memo.marks : new Float64Array(length);
  let same = memo !== undefined && marks === memo.marks && inputs.every((value, index) => Object.is(value, memo.inputs[index]));
  const keep = (slot: number, value: number): void => {
    if (Object.is(marks[slot], value)) return;
    marks[slot] = value;
    same = false;
  };
  for (let index = 0; index < frame.nodes.length; index += 1) {
    const node = frame.nodes[index];
    const centre = nodeCentre(frame, node.id);
    keep(index * MARK_SLOTS, centre ? 1 : 0);
    keep(index * MARK_SLOTS + 1, centre?.x ?? 0);
    keep(index * MARK_SLOTS + 2, centre?.y ?? 0);
    keep(index * MARK_SLOTS + 3, radiusOf(frame, node));
  }
  if (same && memo) return memo.names;
  const names = placeStandingNames(ctx, frame, marks, active, focus);
  standingNamesMemo.set(ctx, { inputs, marks, names });
  return names;
}

/**
 * Greedy in a fixed order against the boxes taken, marks included; a loser is hidden, never overlapped.
 * Each test asks a {@link LibraryLabelOccupancy} raster, then a {@link BoxGrid}: O(marks + names) expected.
 */
function placeStandingNames(
  ctx: CanvasRenderingContext2D,
  frame: LibraryGraphFrame,
  marks: Float64Array,
  active: string | null,
  focus: ReadonlySet<string> | null,
): StandingName[] {
  const { ink } = frame;
  const placedNames: StandingName[] = [];
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
  /** Whether a mark's name exists on this frame: its kind's names stand, or it is open, pointed at or near the focus. */
  const carriesName = (node: LibraryGraphNode): boolean => {
    const kindNamed =
      node.kind === "page" ? (frame.pageLabels ?? true) : node.kind === "concept" ? (frame.conceptLabels ?? frame.sourceLabels) : frame.sourceLabels;
    if (kindNamed) return true;
    if (node.id === frame.selectedId || node.id === active) return true;
    return focus !== null && focus.has(node.id);
  };
  const named: Array<{ node: LibraryGraphNode; index: number; priority: number; radius: number; x: number; y: number }> = [];
  for (let index = 0; index < frame.nodes.length; index += 1) {
    const node = frame.nodes[index];
    if (node.id === active || !carriesName(node)) continue;
    if (marks[index * MARK_SLOTS] === 0) continue;
    const x = marks[index * MARK_SLOTS + 1], y = marks[index * MARK_SLOTS + 2], radius = marks[index * MARK_SLOTS + 3];
    const lineHeight = Math.round(labelFontPx(ink, node.kind) * 1.35);
    const reach = Math.abs(radius) + STANDING_LABEL_GAP + Math.abs(lineHeight);
    if (frame.nodes.length > LEADER_MAX_MARKS &&
      (y + reach < 2 || y - reach > frame.height - 2)) continue;
    named.push({ node, index, priority: rank(node), radius, x, y });
  }
  named.sort(
    (first, second) =>
      first.priority - second.priority ||
      second.radius - first.radius ||
      first.index - second.index,
  );
  const taken = new BoxGrid<ScreenBox & { of?: string }>(STANDING_NAME_GRID_PX, (box) => ({
    left: Math.min(box.x, box.x + box.width),
    top: Math.min(box.y, box.y + box.height),
    right: Math.max(box.x, box.x + box.width),
    bottom: Math.max(box.y, box.y + box.height),
  }));
  // A few names cost less tested directly than a raster of the whole canvas costs to clear.
  const occupancy = named.length > STANDING_NAME_CROWD_MIN
    ? LibraryLabelOccupancy.create(frame.width, frame.height, NAME_GAP_X, NAME_GAP_Y, occupancyByCanvas.get(ctx))
    : null;
  if (occupancy) occupancyByCanvas.set(ctx, occupancy);
  const take = (box: ScreenBox & { of?: string }): void => {
    taken.add(box);
    occupancy?.hold(box.of ?? null, box);
  };
  /** Whether a placed name or a mark other than `own`'s stands within the names' gap of `box`. */
  const takenNear = (box: ScreenBox, own: string): boolean =>
    occupancy?.blocks(box, own) === true ||
    taken.some(
      { x: box.x - NAME_GAP_X, y: box.y - NAME_GAP_Y, width: box.width + NAME_GAP_X * 2, height: box.height + NAME_GAP_Y * 2 },
      0,
      (other) => other.of !== own && overlaps(box, other),
    );
  const overview = frame.overview;
  const indexed = named.length > 0 && overview && frame.layout !== "flow" &&
    Number.isFinite(overview.view.x) && Number.isFinite(overview.view.y) &&
    Number.isFinite(overview.view.scale) && overview.view.scale > 0 && frame.nodes.length > 256
    ? overviewMarkIndex(frame) : null;
  let maxRadius = Math.max(...Object.values(NODE_RADIUS));
  if (indexed) {
    for (const radius of frame.radii?.values() ?? []) maxRadius = Math.max(maxRadius, Math.abs(radius));
  } else if (named.length > 0) {
    for (let index = 0; index < frame.nodes.length; index += 1) {
      if (marks[index * MARK_SLOTS] === 0) continue;
      const x = marks[index * MARK_SLOTS + 1], y = marks[index * MARK_SLOTS + 2], half = marks[index * MARK_SLOTS + 3];
      take({ x: x - half, y: y - half, width: half * 2, height: half * 2, of: frame.nodes[index].id });
    }
  }
  const hitsMark = (box: ScreenBox, own: string): boolean => {
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
  const coverage = named.length > STANDING_NAME_CROWD_MIN ? LibraryLabelCoverage.create(frame.width, frame.height) : null;
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
    return !takenNear(box, own) && !hitsMark(box, own);
  };
  for (const { node, radius: half, x, y } of named) {
    const centre = { x, y };
    const fontPx = labelFontPx(ink, node.kind);
    const lineHeight = Math.round(fontPx * 1.35);
    if (named.length > STANDING_NAME_CROWD_MIN && frame.nodes.length > LEADER_MAX_MARKS) {
      const middle = Math.min(Math.max(2, centre.x), Math.max(2, frame.width - 2));
      const possible = openLine(middle, centre.y + half + STANDING_LABEL_GAP, lineHeight, node.id) ||
        openLine(middle, centre.y - half - STANDING_LABEL_GAP - lineHeight, lineHeight, node.id) ||
        openLine(centre.x + half + STANDING_LABEL_GAP, centre.y - lineHeight / 2, lineHeight, node.id) ||
        openLine(centre.x - half - STANDING_LABEL_GAP, centre.y - lineHeight / 2, lineHeight, node.id);
      if (!possible) continue;
    }
    // Font per kind before measuring, so the tested box matches the drawn step.
    ctx.font = `${fontPx}px ${ink.fontFamily}`;
    /*
     * A flow column's room is the layout's to give, so it replaces both flat caps there; a
     * file keeps its distinguishing tail and a title loses its end. The canvas still bounds both.
     */
    const columnRoom = frame.flowLabelRoom?.[node.kind];
    const cutFlowName = node.kind === "source" ? cutMiddleToWidth : cutEndToWidth;
    const cut =
      columnRoom === undefined
        ? cutName(ctx, node, Math.min(STANDING_LABEL_MAX_WIDTH, frame.width - 8), (budget) =>
            truncateToWidth(ctx, middleEllipsis(node.label, STANDING_LABEL_MAX_CHARS), budget),
          )
        : cutName(ctx, node, Math.min(columnRoom, frame.width - 8), (budget) => cutFlowName(ctx, node.label, budget));
    // A cut that keeps no glyph of the name says nothing, so the mark stands unnamed.
    if (!cut.text) continue;
    let text = cut.text;
    let width = cut.width;
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
      // Only a box starting before the canvas edge plus a gap can narrow the room.
      const reach = frame.width - 2 + NAME_GAP_X - startX;
      // The same gaps `overlaps` tests with, or the cut name still loses its side.
      if (reach >= 0) {
        taken.each({ x: startX, y: lineTop, width: reach, height: lineHeight }, NAME_GAP_X, (other) => {
          if (other.of === node.id || other.x < startX) return;
          if (other.y + other.height + NAME_GAP_Y <= lineTop || other.y - NAME_GAP_Y >= lineTop + lineHeight) return;
          room = Math.min(room, other.x - NAME_GAP_X - startX);
        });
      }
      if (width > room && room >= STANDING_LABEL_MIN_PX) {
        text = cutFlowName(ctx, text, room);
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
     * In columns a name stands on the side its column keeps clear (`flowLabelRoom`):
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
    let box: ScreenBox | null = null;
    let placement = 0;
    for (const [index, candidate] of candidates.entries()) {
      const tried = { x: candidate.x, y: candidate.y, width, height: lineHeight };
      if (tried.y < 2 || tried.y + tried.height > frame.height - 2) continue;
      if (tried.x < 2 || tried.x + tried.width > frame.width - 2) continue;
      if (takenNear(tried, node.id) || hitsMark(tried, node.id)) continue;
      box = tried;
      placement = index;
      break;
    }
    if (!box) continue;
    take(box);
    // A hairline leader only past the four base places; a label touching its dot needs none.
    placedNames.push({ node, text, box, fontPx, leaderFrom: placement >= 4 ? { x, y, half } : null });
  }
  return placedNames;
}

/** Draws placed names in placement order, each at its mark's alpha over a ground outline. */
export function drawStandingNames(
  ctx: CanvasRenderingContext2D,
  frame: LibraryGraphFrame,
  names: readonly StandingName[],
  alphaOf: (id: string) => number,
): void {
  const { ink } = frame;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  for (const { node, text, box, fontPx, leaderFrom } of names) {
    ctx.font = `${fontPx}px ${ink.fontFamily}`;
    if (leaderFrom) {
      const anchor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const away = Math.hypot(anchor.x - leaderFrom.x, anchor.y - leaderFrom.y) || 1;
      const unit = { x: (anchor.x - leaderFrom.x) / away, y: (anchor.y - leaderFrom.y) / away };
      const stop = Math.max(0, away - Math.max(box.width, box.height) / 2 - 2);
      ctx.globalAlpha = alphaOf(node.id);
      ctx.strokeStyle = node.kind === "page" ? ink.page : ink.sourceLabel;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(leaderFrom.x + unit.x * (leaderFrom.half + 1), leaderFrom.y + unit.y * (leaderFrom.half + 1));
      ctx.lineTo(leaderFrom.x + unit.x * stop, leaderFrom.y + unit.y * stop);
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

/** Cut names per canvas, keyed by font, kind, whole-pixel room and label: a resting frame measures nothing twice. */
const cutNames = new WeakMap<CanvasRenderingContext2D, Map<string, { text: string; width: number }>>();
/** Enough for every name of a large folder at a couple of zooms; past it the oldest go first. */
const CUT_NAMES_MAX = 4096;

/** `cut(budget)` at the room floored to a whole pixel, remembered with its width. */
function cutName(
  ctx: CanvasRenderingContext2D,
  node: LibraryGraphNode,
  room: number,
  cut: (budget: number) => string,
): { text: string; width: number } {
  let memo = cutNames.get(ctx);
  if (!memo) {
    memo = new Map();
    cutNames.set(ctx, memo);
  }
  const budget = Math.floor(room);
  const key = `${ctx.font}\u0001${node.kind}\u0001${budget}\u0001${node.label}`;
  const known = memo.get(key);
  if (known) return known;
  const text = cut(budget);
  const entry = { text, width: text ? ctx.measureText(text).width : 0 };
  if (memo.size >= CUT_NAMES_MAX) memo.delete(memo.keys().next().value!);
  memo.set(key, entry);
  return entry;
}

/** One segmenter for every cut, so a name is never split inside an emoji or a decomposed syllable. */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemesOf(text: string): string[] {
  return Array.from(GRAPHEMES.segment(text), (part) => part.segment);
}

/** Fits `text` to `maxWidth`: a phrase loses its end, a single token (a file name) its middle. */
export function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  return text.includes(" ") ? cutEndToWidth(ctx, text, maxWidth) : cutMiddleToWidth(ctx, text, maxWidth);
}

/**
 * Cuts a title off the end, at a word boundary when a word survives, since a middle
 * ellipsis through a sentence halves words at both ends. `""` when no glyph of it fits.
 */
function cutEndToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  const head = headThatFits(ctx, graphemesOf(text), maxWidth - ctx.measureText(ellipsis).width);
  const lastSpace = head.lastIndexOf(" ");
  const cut = (lastSpace > head.length / 2 ? head.slice(0, lastSpace) : head).trimEnd();
  return cut ? `${cut}${ellipsis}` : "";
}

/**
 * Shortens a file name in the middle, because its tail (a date, a number, an extension) tells
 * two marks apart and cutting it gives two marks one name. The tail grows glyph by glyph to a
 * third of the budget; the head is a binary search. `""` when no glyph of it fits.
 */
function cutMiddleToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  const glyphs = graphemesOf(text);
  // The tail is the shorter part, or the name reads as two fragments.
  const tailBudget = maxWidth / 3;
  let tail = 0;
  while (tail < glyphs.length - 1 && ctx.measureText(glyphs.slice(glyphs.length - (tail + 1)).join("")).width <= tailBudget) {
    tail += 1;
  }
  const suffix = `${ellipsis}${glyphs.slice(glyphs.length - tail).join("")}`;
  if (ctx.measureText(suffix).width > maxWidth) {
    const head = headThatFits(ctx, glyphs, maxWidth - ctx.measureText(ellipsis).width);
    return head ? `${head}${ellipsis}` : "";
  }
  const head = headThatFits(ctx, glyphs, maxWidth - ctx.measureText(suffix).width);
  return head || tail > 0 ? `${head}${suffix}` : "";
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
  // The tail keeps a third after the ellipsis, the same split as `cutMiddleToWidth`.
  const tail = Math.max(1, Math.floor(keep / 3));
  const head = keep - tail;
  return `${glyphs.slice(0, head).join("")}…${glyphs.slice(glyphs.length - tail).join("")}`;
}

/** The longest run of whole `glyphs` from the start whose width is within `budget`. */
function headThatFits(ctx: CanvasRenderingContext2D, glyphs: readonly string[], budget: number): string {
  let low = 0;
  let high = glyphs.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(glyphs.slice(0, middle).join("")).width <= budget) low = middle;
    else high = middle - 1;
  }
  return glyphs.slice(0, low).join("");
}
