import type { LibraryGraph, LibraryGraphNode, LibraryGraphNodeKind } from "./build-library-graph";
import { maxOf, minOf } from "./library-graph-extremes";
import type { LayoutPoint } from "./library-graph-layout";

/**
 * The islands layout: the Library's overview once a folder is too large to name, showing
 * shape and state instead. A topic is a concept; its island holds the pages about it
 * (`describes:`) or, failing that, naming it, and the files they read. Pages naming none join
 * their wiki sub-folder's island, else Unsorted; unread files form a shore band.
 *
 * Pure and deterministic. Inside an island marks sit on a Vogel sunflower spiral, pages at
 * the centre; islands pack largest first on one spiral (`packIslands`): O(n log n + E +
 * (k + P·h) log P) with the label sorts and the edge pass, for k islands over P spiral points.
 */

/** Below this many marks the flow picture names everything; from here the overview is islands. */
export const ISLANDS_MIN_MARKS = 400;
/** Dot radii in world units at the overview: a page is a small disc, a file a smaller square. */
export const ISLAND_PAGE_RADIUS = 1.6;
export const ISLAND_SOURCE_RADIUS = 1;
/** A page dot's radius, as a share of `ISLAND_PAGE_RADIUS`, from the least-read page to the most. */
const ISLAND_PAGE_GRAIN_MIN = 0.85;
const ISLAND_PAGE_GRAIN_MAX = 1.25;
/** Breath between dots, and between islands, in world units. */
const DOT_GAP = 1.2;
const ISLAND_GAP = 10;
/** The rim an island keeps clear outside its last dot. */
const ISLAND_MARGIN = 3;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Island {
  id: string;
  kind: "concept" | "folder" | "unsorted" | "unread";
  label: string;
  x: number;
  y: number;
  r: number;
  pages: string[];
  sources: string[];
  /** The concept node this island stands for, when it is one. */
  conceptId: string | null;
  /** The Unread shore's band about `x, y`; `r` is then half its height, and presses test the rectangle. */
  band?: { width: number; height: number };
}

export interface IslandsLayout {
  positions: Map<string, LayoutPoint>;
  /** Every mark's radius at the overview, already scaled with the picture. */
  radii: Map<string, number>;
  islands: Island[];
  extent: { width: number; height: number };
}

const LABEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function byLabelThenId(a: { id: string; label: string }, b: { id: string; label: string }): number {
  return LABEL_COLLATOR.compare(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** `wiki/payments/fees` → `payments`; a page at the wiki's root has no folder. */
function folderOf(ref: string): string | null {
  const parts = ref.split("/");
  if (parts.length < 3) return null;
  return parts.slice(1, -1).join("/");
}

/** Packing order by kind: named islands take the middle and Unsorted follows; Unread is the shore, packed apart. */
function islandRank(kind: Island["kind"]): number {
  return kind === "unread" ? 2 : kind === "unsorted" ? 1 : 0;
}

/**
 * The finest spiral step in world units, about one small dot's cell, so small islands sit close.
 * A larger island walks a coarser spiral, its step the power of two nearest a quarter of its
 * radius, since a fine step only finds the same place after many more points; powers of two keep
 * the spirals few, each with its own bounds.
 */
const SPIRAL_STEP = 2;

function spiralStep(r: number): number {
  return Math.max(SPIRAL_STEP, 2 ** Math.round(Math.log2(Math.max(SPIRAL_STEP, r / 4))));
}

/**
 * The most each spiral point could still hold: a max tree over per-point upper bounds on the
 * radius an island centred there may have. A point no island has asked about is unbounded.
 */
class ClearanceTree {
  private size = 1;
  /**
   * Double precision: a single-precision bound rounded up to stay an upper bound can land on the
   * radius it was refused for, and the point is then asked forever.
   */
  private max = new Float64Array(2).fill(Infinity);

  constructor(points: number) {
    this.grow(points);
  }

  /** The first point whose bound admits an island of radius `r`; capacity doubles when none does. */
  firstAtLeast(r: number): number {
    while (this.max[1] < r) this.grow(this.size * 2);
    let node = 1;
    while (node < this.size) node = this.max[node * 2] >= r ? node * 2 : node * 2 + 1;
    return node - this.size;
  }

  /** Lowers point `i`'s bound; a bound only ever falls, since placed islands never move. */
  lower(i: number, bound: number): void {
    let node = i + this.size;
    this.max[node] = bound;
    for (node >>= 1; node >= 1; node >>= 1) this.max[node] = Math.max(this.max[node * 2], this.max[node * 2 + 1]);
  }

  private grow(points: number): void {
    let size = this.size;
    while (size < points) size *= 2;
    if (size === this.size && this.max.length === size * 2) return;
    const next = new Float64Array(size * 2).fill(Infinity);
    next.set(this.max.subarray(this.size, this.size * 2), size);
    for (let node = size - 1; node >= 1; node -= 1) next[node] = Math.max(next[node * 2], next[node * 2 + 1]);
    this.size = size;
    this.max = next;
  }
}

/**
 * Islands packed about the centre in the order given: each takes the first point of its
 * golden-angle spiral (`spiralStep`), stretched to `aspect`, that keeps `ISLAND_GAP` from every
 * island placed.
 *
 * A scan from the centre per island would be O(k·P) for k islands over P spiral points, minutes
 * at five thousand islands. Instead each point keeps an upper bound on the radius it can still
 * hold: when a point is refused, its exact clearance (read from a uniform grid of placed
 * islands) is stored, and since islands never move, it can only shrink. A max tree per spiral
 * over those bounds jumps straight to the first point worth asking, and a point is asked again
 * only by an island small enough to fit its bound: O((k + P·h) log P) grid queries, where h, the
 * times one point is re-asked, is at most the number of distinct island radii below its first
 * bound. The answer is the same first free point a scan from the centre finds, with no step
 * limit, so no island is ever left overlapping another.
 */
function packIslands(islands: Array<{ x: number; y: number; r: number }>, aspect: number): void {
  if (islands.length === 0) return;
  let smallest = Infinity;
  let area = 0;
  for (const island of islands) {
    smallest = Math.min(smallest, island.r);
    area += Math.PI * (island.r + ISLAND_GAP) ** 2;
  }
  const cell = Math.max(SPIRAL_STEP * 4, smallest * 2 + ISLAND_GAP);
  const grid = new Map<number, number[]>();
  // Cell coordinates packed into one number; 2^20 cells either way is far past any folder.
  const keyOf = (cx: number, cy: number): number => (cx + 0x80000) * 0x100000 + (cy + 0x80000);
  const placed: Array<{ x: number; y: number; r: number }> = [];
  /** The largest radius an island centred here could have, exact whenever it is below `r`. */
  const clearance = (x: number, y: number, r: number): number => {
    const reach = r + ISLAND_GAP / 2;
    let least = Infinity;
    for (let cx = Math.floor((x - reach) / cell); cx <= Math.floor((x + reach) / cell); cx += 1) {
      for (let cy = Math.floor((y - reach) / cell); cy <= Math.floor((y + reach) / cell); cy += 1) {
        const held = grid.get(keyOf(cx, cy));
        if (!held) continue;
        for (const index of held) {
          const other = placed[index];
          const dx = other.x - x;
          const dy = other.y - y;
          const room = Math.sqrt(dx * dx + dy * dy) - other.r - ISLAND_GAP;
          if (room < least) least = room;
        }
      }
    }
    return least;
  };
  const place = (island: { x: number; y: number; r: number }): void => {
    const index = placed.length;
    placed.push(island);
    const reach = island.r + ISLAND_GAP / 2;
    for (let cx = Math.floor((island.x - reach) / cell); cx <= Math.floor((island.x + reach) / cell); cx += 1) {
      for (let cy = Math.floor((island.y - reach) / cell); cy <= Math.floor((island.y + reach) / cell); cy += 1) {
        const key = keyOf(cx, cy);
        const held = grid.get(key);
        if (held) held.push(index);
        else grid.set(key, [index]);
      }
    }
  };
  // Point i stands at radius step·√i, so the spiral's first P points cover an area of P·π·step²·aspect.
  const trees = new Map<number, ClearanceTree>();
  for (const island of islands) {
    const step = spiralStep(island.r);
    let tree = trees.get(step);
    if (!tree) {
      tree = new ClearanceTree(Math.ceil(area / (Math.PI * step ** 2)) + 64);
      trees.set(step, tree);
    }
    for (;;) {
      const i = tree.firstAtLeast(island.r);
      const d = step * Math.sqrt(i);
      const x = Math.cos(i * GOLDEN_ANGLE) * d * aspect;
      const y = Math.sin(i * GOLDEN_ANGLE) * d;
      const room = clearance(x, y, island.r);
      if (room >= island.r) {
        island.x = x;
        island.y = y;
        place(island);
        tree.lower(i, -Infinity);
        break;
      }
      tree.lower(i, room);
    }
  }
}

export function islandsLayout(graph: LibraryGraph, world: { width: number; height: number }, labels: { unsorted: string; unread: string }): IslandsLayout {
  // The packing spiral is stretched to the box's aspect, so a wide canvas gets a wide map.
  const aspect = Math.min(2, Math.max(1, Math.max(1, world.width) / Math.max(1, world.height)));
  const byKind = new Map<LibraryGraphNodeKind, LibraryGraphNode[]>([["source", []], ["page", []], ["concept", []]]);
  for (const node of graph.nodes) byKind.get(node.kind)?.push(node);
  const pages = [...(byKind.get("page") ?? [])].sort(byLabelThenId);
  const concepts = [...(byKind.get("concept") ?? [])].sort(byLabelThenId);
  const conceptRank = new Map(concepts.map((node, rank) => [node.id, rank]));
  const conceptById = new Map(concepts.map((node) => [node.id, node]));

  const about = new Map<string, string[]>();
  const mentions = new Map<string, string[]>();
  const cites = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = edge.relation === "describes" ? about : edge.relation === "mentions" ? mentions : cites;
    const held = list.get(edge.source);
    if (held) held.push(edge.target);
    else list.set(edge.source, [edge.target]);
  }

  /*
   * A page's island: the first concept its `describes:` lists, since the writer put it first;
   * else its first named concept by title; else its wiki sub-folder; else Unsorted.
   */
  const islandOfPage = new Map<string, string>();
  const members = new Map<string, { kind: Island["kind"]; label: string; conceptId: string | null; pages: string[]; sources: string[] }>();
  const claim = (key: string, kind: Island["kind"], label: string, conceptId: string | null) => {
    let held = members.get(key);
    if (!held) {
      held = { kind, label, conceptId, pages: [], sources: [] };
      members.set(key, held);
    }
    return held;
  };
  const firstNamed = (id: string): string | null => {
    let best: string | null = null;
    for (const concept of mentions.get(id) ?? []) {
      const rank = conceptRank.get(concept);
      if (rank !== undefined && (best === null || rank < conceptRank.get(best)!)) best = concept;
    }
    return best;
  };
  for (const page of pages) {
    const lead = (about.get(page.id) ?? []).find((id) => conceptRank.has(id)) ?? firstNamed(page.id);
    let key: string;
    if (lead !== null) {
      const concept = conceptById.get(lead)!;
      key = lead;
      claim(key, "concept", concept.label, concept.id).pages.push(page.id);
    } else {
      const folder = folderOf(page.ref);
      key = folder ? `folder:${folder}` : "unsorted";
      claim(key, folder ? "folder" : "unsorted", folder ?? labels.unsorted, null).pages.push(page.id);
    }
    islandOfPage.set(page.id, key);
  }
  // A file's island: the island of the first page that read it; a file nobody read is Unread.
  const islandOfSource = new Map<string, string>();
  for (const page of pages) {
    for (const source of cites.get(page.id) ?? []) {
      if (islandOfSource.has(source)) continue;
      const key = islandOfPage.get(page.id)!;
      islandOfSource.set(source, key);
      members.get(key)!.sources.push(source);
    }
  }
  for (const source of [...(byKind.get("source") ?? [])].sort(byLabelThenId)) {
    if (islandOfSource.has(source.id)) continue;
    claim("unread", "unread", labels.unread, null).sources.push(source.id);
  }

  // Inside each island: a sunflower, pages first.
  const positions = new Map<string, LayoutPoint>();
  const radii = new Map<string, number>();
  // A page's dot grows with the files it read, 0.85 to 1.25 page radii, scaled within the folder.
  const reads = new Map<string, number>();
  for (const page of pages) reads.set(page.id, (cites.get(page.id) ?? []).length);
  const mostRead = maxOf(reads.values(), 1);
  const leastRead = minOf(reads.values(), mostRead);
  const pageRadius = (id: string): number => {
    const t = mostRead > leastRead ? ((reads.get(id) ?? 0) - leastRead) / (mostRead - leastRead) : 0.5;
    return ISLAND_PAGE_RADIUS * (ISLAND_PAGE_GRAIN_MIN + (ISLAND_PAGE_GRAIN_MAX - ISLAND_PAGE_GRAIN_MIN) * t);
  };
  const cellOf = (r: number): number => (r * 2 + DOT_GAP) ** 2;
  const sourceCell = cellOf(ISLAND_SOURCE_RADIUS);
  type Packed = Island & { local: Array<{ id: string; x: number; y: number; r: number }> };
  const unreadMember = members.get("unread") ?? null;
  const islands: Packed[] = [...members.entries()]
    .filter(([, held]) => held.kind !== "unread")
    .map(([id, held]) => {
      const local: Array<{ id: string; x: number; y: number; r: number }> = [];
      let area = 0;
      const dots = [
        ...held.pages.map((p) => ({ id: p, r: pageRadius(p), cell: cellOf(pageRadius(p)) })),
        ...held.sources.map((s) => ({ id: s, r: ISLAND_SOURCE_RADIUS, cell: sourceCell })),
      ];
      dots.forEach((dot, index) => {
        // The i-th dot stands at the radius that encloses the area of every cell before it.
        const radius = Math.sqrt((area + dot.cell / 2) / Math.PI);
        const angle = index * GOLDEN_ANGLE;
        local.push({ id: dot.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, r: dot.r });
        area += dot.cell;
      });
      const r = Math.sqrt(area / Math.PI) + ISLAND_MARGIN;
      return { id, kind: held.kind, label: held.label, conceptId: held.conceptId, pages: held.pages, sources: held.sources, r, x: 0, y: 0, local };
    })
    /*
     * Largest named island first, so the biggest topic is the middle; Unsorted packs after
     * every named island, whatever its size, since the middle belongs to what the wiki is about.
     */
    .sort((a, b) => islandRank(a.kind) - islandRank(b.kind) || b.r - a.r || a.id.localeCompare(b.id));

  packIslands(islands, aspect);

  /*
   * Unread files are not a topic, so they form a shore band under the islands, as wide as
   * the archipelago, rather than a disc that takes the middle of the map.
   */
  if (unreadMember) {
    const cell = ISLAND_SOURCE_RADIUS * 2 + DOT_GAP;
    const n = unreadMember.sources.length;
    let left = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const island of islands) {
      left = Math.min(left, island.x - island.r);
      right = Math.max(right, island.x + island.r);
      bottom = Math.max(bottom, island.y + island.r);
    }
    const hasIslands = Number.isFinite(left);
    // Alone, the shore is still a band: wider than tall in the world's proportion.
    const span = hasIslands ? right - left : Math.sqrt(n) * cell * Math.sqrt(aspect * 2);
    const cols = Math.max(1, Math.floor((span - ISLAND_MARGIN * 2) / cell));
    const rows = Math.max(1, Math.ceil(n / cols));
    // Every other row steps half a cell along, so the band is a shore of pebbles, not a grid.
    const width = cols * cell + cell / 2 + ISLAND_MARGIN * 2;
    const height = rows * cell + ISLAND_MARGIN * 2;
    const local: Array<{ id: string; x: number; y: number; r: number }> = unreadMember.sources.map((id, i) => {
      const row = Math.floor(i / cols);
      return {
        id,
        x: -width / 2 + ISLAND_MARGIN + ((i % cols) + 0.5) * cell + (row % 2 === 1 ? cell / 2 : 0),
        y: -height / 2 + ISLAND_MARGIN + (row + 0.5) * cell,
        r: ISLAND_SOURCE_RADIUS,
      };
    });
    islands.push({
      id: "unread",
      kind: "unread",
      label: unreadMember.label,
      conceptId: null,
      pages: [],
      sources: unreadMember.sources,
      x: hasIslands ? (left + right) / 2 : 0,
      y: hasIslands ? bottom + ISLAND_GAP * 2 + height / 2 : 0,
      r: height / 2,
      band: { width, height },
      local,
    });
  }

  // The whole map scaled to the world box, keeping its aspect, and centred.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const island of islands) {
    const halfW = island.band ? island.band.width / 2 : island.r;
    const halfH = island.band ? island.band.height / 2 : island.r;
    minX = Math.min(minX, island.x - halfW);
    minY = Math.min(minY, island.y - halfH);
    maxX = Math.max(maxX, island.x + halfW);
    maxY = Math.max(maxY, island.y + halfH);
  }
  if (!Number.isFinite(minX)) {
    return { positions, radii, islands: [], extent: { width: Math.max(1, world.width), height: Math.max(1, world.height) } };
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const s = Math.min(Math.max(1, world.width) / spanX, Math.max(1, world.height) / spanY);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const out: Island[] = [];
  for (const island of islands) {
    const x = world.width / 2 + (island.x - centreX) * s;
    const y = world.height / 2 + (island.y - centreY) * s;
    for (const dot of island.local) {
      positions.set(dot.id, { x: x + dot.x * s, y: y + dot.y * s });
      radii.set(dot.id, dot.r * s);
    }
    out.push({
      id: island.id,
      kind: island.kind,
      label: island.label,
      conceptId: island.conceptId,
      pages: island.pages,
      sources: island.sources,
      x,
      y,
      r: island.r * s,
      ...(island.band ? { band: { width: island.band.width * s, height: island.band.height * s } } : {}),
    });
  }
  /*
   * A concept stands at its island's centre with no radius, so a press on the island opens it.
   * One that leads no page's island (every page about it leads with another) stands amid the
   * pages that link it, so their lines stay short and point where those pages are; a concept
   * no page links stands at the map's centre.
   */
  const islandByConcept = new Map(out.map((island) => [island.conceptId, island]));
  const amid = new Map<string, { x: number; y: number; n: number }>();
  for (const [page, targets] of [...about, ...mentions]) {
    const at = positions.get(page);
    if (!at) continue;
    for (const target of targets) {
      if (islandByConcept.has(target)) continue;
      const sum = amid.get(target);
      if (sum) {
        sum.x += at.x;
        sum.y += at.y;
        sum.n += 1;
      } else amid.set(target, { x: at.x, y: at.y, n: 1 });
    }
  }
  for (const concept of concepts) {
    const island = islandByConcept.get(concept.id);
    const sum = amid.get(concept.id);
    positions.set(
      concept.id,
      island ? { x: island.x, y: island.y } : sum ? { x: sum.x / sum.n, y: sum.y / sum.n } : { x: world.width / 2, y: world.height / 2 },
    );
    radii.set(concept.id, 0);
  }
  return { positions, radii, islands: out, extent: { width: world.width, height: world.height } };
}
