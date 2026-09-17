import type { LibraryGraph, LibraryGraphNodeKind } from "./build-library-graph";
import type { LayoutPoint } from "./library-graph-layout";

/**
 * **The flow layout** — sources on the left, the pages written from them in the middle,
 * the concepts those pages name on the right. Evidence flows left to right.
 *
 * The owner, 2026-09-17, on the live force picture with two pages: *"looks half-made;
 * can we restructure it altogether?"* A force layout answers "what is near what" and needs
 * a crowd to say it; a folder of two or twenty documents got two or twenty dots floating
 * in a black field, at positions that changed with every visit. The Library's own fact is
 * not nearness, it is **direction**: a source is read, a page is written from it, a concept
 * is named by it. Columns say that without a legend, fill the canvas at any count, and
 * put every node at the same place on every machine — the same reason the Architecture
 * canvas reads left to right (owner direction 2026-08-28: "workflows are mostly horizontal").
 *
 * Deterministic and pure: the same graph and box give the same picture. Ordering inside
 * a column is by barycentre of the neighbours in the column before it (a one-sweep crossing
 * reduction), with the page column ordered first by title so the middle is stable and the
 * outer columns follow it. Rows are spread over the height with a floor that keeps a label
 * under every mark and a ceiling that keeps a short column from stretching into a ladder.
 */

/**
 * World units. The engine hands this layout a **world** box, the pixel box seen through the
 * zoom ceiling (`libraryZoomMax`), so that the fit lands on the ceiling for a small folder
 * and every mark draws at the size the ceiling was chosen for (`LIBRARY_MAX_MARK_PX`). A
 * folder with more rows than the box holds lays out taller than the world, keeping the
 * box's aspect, and the fit scales the whole picture down — a long list, not a smaller box —
 * but never below the row pitch a name needs, past which a column folds instead.
 */
export const FLOW_SIDE_PAD = 24;
export const FLOW_TOP_PAD = 16;
/** Rows at the ceiling: 44px and 72px on screen; the floor clears the widest mark (18) plus a breath. */
export const FLOW_ROW_MIN = 22;
export const FLOW_ROW_MAX = 36;
/**
 * The least a row may be on screen, in px: a page's name is an 11px face on a 15px line
 * (`draw-library-graph`), and a row under 18px puts two names on one line. The picture
 * may shrink until a row is this, and then a named column folds rather than shrinks.
 */
export const FLOW_ROW_MIN_PX = 18;
/** Sub-columns inside a folded file band: 24px at the ceiling for a 14px square. */
export const FLOW_GRID_STEP = 12;
/**
 * Room kept outside the outer columns for the names that stand beside them, in screen px;
 * `STANDING_LABEL_MAX_WIDTH` in the renderer, which does its own truncation past it.
 */
export const FLOW_LABEL_ROOM_PX = 132;
/** The least room a name is given at a narrow canvas: a few characters and an ellipsis. */
const FLOW_LABEL_ROOM_MIN_PX = 40;
/** The widest mark's radius (`WIDEST_MARK_WORLD_RADIUS`) and the gap a name stands from it. */
const WIDEST_MARK = 9;
const NAME_GAP = 5;
/** A breath between a name's end and the next thing, in screen px. */
const BREATH_PX = 8;

const COLUMN_ORDER: readonly LibraryGraphNodeKind[] = ["source", "page", "concept"];

function byLabel(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
}

/** Mean row index of a node's neighbours in `reference`, or +Infinity when it has none. */
function barycentre(id: string, neighbours: ReadonlyMap<string, readonly string[]>, reference: ReadonlyMap<string, number>): number {
  const rows = (neighbours.get(id) ?? []).map((other) => reference.get(other)).filter((row): row is number => row !== undefined);
  if (rows.length === 0) return Number.POSITIVE_INFINITY;
  return rows.reduce((sum, row) => sum + row, 0) / rows.length;
}

interface FlowColumn {
  kind: LibraryGraphNodeKind;
  x: number;
  ids: string[];
  /** How many sub-columns the band was folded into; 1 means every mark has a row of its own. */
  grid: number;
}

export interface FlowLayout {
  positions: Map<string, LayoutPoint>;
  columns: FlowColumn[];
  rowGap: number;
  /** The box the picture was laid in: the world box, or a larger one the camera fits. */
  extent: { width: number; height: number };
  /** The zoom the camera will fit `extent` at: the ceiling, or lower for a long folder. */
  scale: number;
}

export interface FlowWorld {
  width: number;
  height: number;
  /** The zoom the world was derived at; the picture's own scale is this or lower. */
  ceiling?: number;
}

export function flowLayout(graph: LibraryGraph, world: FlowWorld): FlowLayout {
  const nodesByKind = new Map<LibraryGraphNodeKind, typeof graph.nodes>();
  for (const kind of COLUMN_ORDER) nodesByKind.set(kind, []);
  for (const node of graph.nodes) nodesByKind.get(node.kind)?.push(node);

  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const list = neighbours.get(from);
    if (list) list.push(to);
    else neighbours.set(from, [to]);
  };
  for (const edge of graph.edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  /**
   * **Pages are ordered by topic, then by title.** The middle column is the one a person
   * reads names in, so it must not shuffle when a file is added — and it should read as
   * the wiki's own structure. Concepts are ranked by title first; a page's rank is the
   * mean rank of the concepts it names, so pages that name the same concept stand together
   * and the concept beside them lands level with its group (one crossing-reduction sweep,
   * both ways). A page naming no concept goes last, by title. A folder with no concepts is
   * plain title order.
   */
  const conceptRank = new Map([...(nodesByKind.get("concept") ?? [])].sort(byLabel).map((node, row) => [node.id, row]));
  const pages = [...(nodesByKind.get("page") ?? [])]
    .map((node) => ({ node, key: barycentre(node.id, neighbours, conceptRank) }))
    .sort((a, b) => a.key - b.key || byLabel(a.node, b.node))
    .map((entry) => entry.node);
  const pageRow = new Map(pages.map((node, row) => [node.id, row]));
  const outer = (kind: LibraryGraphNodeKind) =>
    [...(nodesByKind.get(kind) ?? [])]
      .map((node) => ({ node, key: barycentre(node.id, neighbours, pageRow) }))
      .sort((a, b) => a.key - b.key || byLabel(a.node, b.node))
      .map((entry) => entry.node);
  const candidates: Array<{ kind: LibraryGraphNodeKind; nodes: typeof graph.nodes }> = [
    { kind: "source", nodes: outer("source") },
    { kind: "page", nodes: pages },
    { kind: "concept", nodes: outer("concept") },
  ];
  const ordered = candidates.filter((column) => column.nodes.length > 0);

  const worldWidth = Math.max(1, world.width);
  const worldHeight = Math.max(1, world.height);
  const ceiling = world.ceiling ?? 1;
  const innerHeight = Math.max(0, worldHeight - FLOW_TOP_PAD * 2);

  /**
   * **Rows.** A page and a concept carry a name, so each keeps a row of its own while the
   * picture can still afford one: the column grows past the box and the camera fits it, the
   * way a long list scrolls rather than shrinks its type — down to the row pitch a name
   * needs (`FLOW_ROW_MIN_PX`). Past that the named column **folds** into sub-columns, each
   * with room for its names, the way an index runs in two columns. A file is a square with
   * its name only on request in a crowd, so the file band folds to the row count the named
   * columns settled on — 300 files are thirty rows of ten squares beside two columns of
   * pages, not a ladder the camera shrinks to nothing to show.
   */
  const rowsFit = Math.max(1, Math.floor(innerHeight / FLOW_ROW_MIN) + 1);
  const leastScale = FLOW_ROW_MIN_PX / FLOW_ROW_MIN;
  const rowsAffordable = Math.max(1, Math.floor(((worldHeight * ceiling) / leastScale - FLOW_TOP_PAD * 2) / FLOW_ROW_MIN) + 1);
  const named = ordered.filter((column) => column.kind !== "source");
  const namedGrid = new Map(named.map((column) => [column.kind, Math.max(1, Math.ceil(column.nodes.length / rowsAffordable))]));
  const rowsOf = (count: number, grid: number): number => Math.ceil(count / grid);
  // A file band folds on the same terms as a named column: only past the rows the picture
  // can afford at the 18px floor. Measured 2026-09-18 in a real window (648px canvas): folding
  // at the rows that fit *at the ceiling* folded twelve files into two unnamed sub-columns
  // beside ten named pages, when a twelve-row list at 1.7× named every one of them.
  const gridOf = (kind: LibraryGraphNodeKind, count: number): number =>
    kind === "source" ? Math.max(1, Math.ceil(count / rowsAffordable)) : (namedGrid.get(kind) ?? 1);
  const longestRows = Math.max(1, ...ordered.map((column) => rowsOf(column.nodes.length, gridOf(column.kind, column.nodes.length))));
  // One gap for every column, so rows line up across the picture and an edge between two
  // columns is a straight-ish S rather than a fan.
  const rowGap =
    longestRows > rowsFit ? FLOW_ROW_MIN : Math.min(FLOW_ROW_MAX, Math.max(FLOW_ROW_MIN, longestRows > 1 ? innerHeight / (longestRows - 1) : FLOW_ROW_MAX));
  const height = Math.max(worldHeight, rowGap * (longestRows - 1) + FLOW_TOP_PAD * 2);

  /**
   * **Width.** The picture keeps the box's aspect when it grows taller than it, so the
   * fitted camera fills the width as well as the height instead of leaving a strip down
   * the middle. The room a name needs is a screen budget: `FLOW_LABEL_ROOM_PX` where the
   * canvas affords it, and at a narrow canvas what is left once the bands and a breath
   * per gap are paid, shared equally by every place a name stands — the renderer
   * truncates a name to the room it has. In world units the room is as much wider as the
   * picture is smaller, so the scale is settled in a few turns because they depend on
   * each other.
   */
  const grids = ordered.map((column) => gridOf(column.kind, column.nodes.length));
  const namedLanes = ordered.reduce((sum, column, index) => sum + (column.kind === "source" ? 0 : grids[index] - 1), 0);
  // A folded file band names nothing at rest, so it keeps no room on its outer side.
  const leftRoom = ordered[0]?.kind === "source" && (grids[0] ?? 1) > 1 ? 0 : 1;
  const roomPlaces = ordered.length > 1 || (grids[0] ?? 1) > 1 ? leftRoom + 1 + (ordered.length - 1) + namedLanes : 0;
  const aspectWidth = worldWidth * (height / worldHeight);
  let width = aspectWidth;
  let scale = ceiling * Math.min(worldHeight / height, worldWidth / width);
  let bandWidths: number[] = [];
  let labelRoom = 0;
  for (let turn = 0; turn < 6; turn += 1) {
    const breath = BREATH_PX / scale;
    const sourceBands = ordered.reduce((sum, column, index) => sum + (column.kind === "source" ? (grids[index] - 1) * FLOW_GRID_STEP : 0), 0);
    // Everything but the name rooms, in world units at this scale.
    const fixed = FLOW_SIDE_PAD * 2 + sourceBands + namedLanes * (WIDEST_MARK * 2 + NAME_GAP + breath) + Math.max(0, ordered.length - 1) * breath;
    const budget = roomPlaces > 0 ? Math.max(FLOW_LABEL_ROOM_MIN_PX / scale, (worldWidth * (ceiling / scale) - fixed) / roomPlaces) : 0;
    labelRoom = roomPlaces > 0 ? Math.min(FLOW_LABEL_ROOM_PX / scale, budget) : 0;
    const nameStep = WIDEST_MARK * 2 + NAME_GAP + labelRoom + breath;
    bandWidths = ordered.map((column, index) => (grids[index] - 1) * (column.kind === "source" ? FLOW_GRID_STEP : nameStep));
    const needed = fixed + labelRoom * roomPlaces;
    const wanted = Math.max(aspectWidth, needed);
    const next = ceiling * Math.min(worldHeight / height, worldWidth / wanted);
    width = wanted;
    if (Math.abs(next - scale) < 1e-6) break;
    scale = next;
  }
  const bandsTotal = bandWidths.reduce((sum, w) => sum + w, 0);
  const gap = ordered.length > 1 ? (width - FLOW_SIDE_PAD * 2 - labelRoom * (leftRoom + 1) - bandsTotal) / (ordered.length - 1) : 0;
  const columnX = (index: number): number => {
    if (ordered.length === 1) return width / 2;
    let x = FLOW_SIDE_PAD + labelRoom * leftRoom;
    for (let i = 0; i < index; i += 1) x += bandWidths[i] + gap;
    return x + bandWidths[index] / 2;
  };
  const stepOf = (kind: LibraryGraphNodeKind): number =>
    kind === "source" ? FLOW_GRID_STEP : WIDEST_MARK * 2 + NAME_GAP + labelRoom + BREATH_PX / scale;

  /**
   * The column with the most rows is spread evenly about the middle. Every other column
   * takes, for each of its marks, the mean row of the neighbours it has in the column
   * placed before it — a page sits level with the sources it was written from, a concept
   * level with the pages that name it — then marks are pushed apart to the row gap in
   * order, and the whole column is re-centred so the push does not drift it downward.
   * Inside a folded band, sub-columns share rows and only the x steps.
   */
  const positions = new Map<string, LayoutPoint>();
  const yOf = new Map<string, number>();
  const placeEven = (count: number): number[] => {
    const span = rowGap * (count - 1);
    const top = height / 2 - span / 2;
    return Array.from({ length: count }, (_, row) => top + rowGap * row);
  };
  const placeByNeighbours = (ids: readonly string[], reference: ReadonlySet<string>): number[] => {
    const wanted = ids.map((id) => {
      const ys = (neighbours.get(id) ?? []).filter((other) => reference.has(other)).map((other) => yOf.get(other)).filter((y): y is number => y !== undefined);
      return ys.length > 0 ? ys.reduce((sum, y) => sum + y, 0) / ys.length : Number.NaN;
    });
    const ys: number[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      const target = Number.isNaN(wanted[i]) ? (ys.length > 0 ? ys[ys.length - 1] + rowGap : height / 2) : wanted[i];
      ys.push(ys.length > 0 ? Math.max(target, ys[ys.length - 1] + rowGap) : target);
    }
    const middle = (ys[0] + ys[ys.length - 1]) / 2;
    const shift = height / 2 - middle;
    return ys.map((y) => y + shift);
  };

  const columns: FlowColumn[] = ordered.map((column, index) => ({
    kind: column.kind,
    x: columnX(index),
    ids: column.nodes.map((node) => node.id),
    grid: grids[index],
  }));
  const anchorIndex = columns.reduce((best, column, index) => (rowsOf(column.ids.length, column.grid) > rowsOf(columns[best].ids.length, columns[best].grid) ? index : best), 0);

  /** Lays one column: a plain band takes the rows as given; a folded band tiles them. */
  const place = (index: number, rowYs: number[]): void => {
    const column = columns[index];
    const count = rowsOf(column.ids.length, column.grid);
    const step = stepOf(column.kind);
    const left = column.x - (step * (column.grid - 1)) / 2;
    column.ids.forEach((id, i) => {
      const sub = Math.floor(i / count);
      const row = i % count;
      const y = rowYs[Math.min(row, rowYs.length - 1)];
      const x = column.grid === 1 ? column.x : left + step * sub;
      yOf.set(id, y);
      positions.set(id, { x, y });
    });
  };
  const rowsFor = (index: number, reference: ReadonlySet<string> | null): number[] => {
    const column = columns[index];
    if (column.grid > 1 || reference === null) return placeEven(rowsOf(column.ids.length, column.grid));
    return placeByNeighbours(column.ids, reference);
  };
  place(anchorIndex, rowsFor(anchorIndex, null));
  for (let index = anchorIndex + 1; index < columns.length; index += 1) {
    place(index, rowsFor(index, new Set(columns[index - 1].ids)));
  }
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    place(index, rowsFor(index, new Set(columns[index + 1].ids)));
  }

  return { positions, columns, rowGap, extent: { width, height }, scale };
}
