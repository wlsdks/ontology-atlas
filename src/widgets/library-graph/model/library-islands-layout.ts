import type { LibraryGraph, LibraryGraphNode, LibraryGraphNodeKind } from "./build-library-graph";
import type { LayoutPoint } from "./library-graph-layout";

/**
 * The islands layout: the Library's overview once a folder is too large to name, showing
 * shape and state instead. A topic is a concept; its island holds the pages naming it and
 * the files they read. Pages naming none join their wiki sub-folder's island, else
 * Unsorted; unread files form a shore band.
 *
 * Pure and deterministic. Inside an island marks sit on a Vogel sunflower spiral, pages at
 * the centre; islands pack largest first, each trying up to s = 4000 spiral steps against the
 * k placed: O(n log n + E + k²·s) with the label sorts and the edge pass.
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

function byLabel(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
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

export function islandsLayout(graph: LibraryGraph, world: { width: number; height: number }, labels: { unsorted: string; unread: string }): IslandsLayout {
  // The packing spiral is stretched to the box's aspect, so a wide canvas gets a wide map.
  const aspect = Math.min(2, Math.max(1, Math.max(1, world.width) / Math.max(1, world.height)));
  const byKind = new Map<LibraryGraphNodeKind, LibraryGraphNode[]>([["source", []], ["page", []], ["concept", []]]);
  for (const node of graph.nodes) byKind.get(node.kind)?.push(node);
  const pages = [...(byKind.get("page") ?? [])].sort(byLabel);
  const concepts = [...(byKind.get("concept") ?? [])].sort(byLabel);
  const conceptRank = new Map(concepts.map((node, rank) => [node.id, rank]));
  const conceptById = new Map(concepts.map((node) => [node.id, node]));

  const mentions = new Map<string, string[]>();
  const cites = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = edge.relation === "mentions" ? mentions : cites;
    const held = list.get(edge.source);
    if (held) held.push(edge.target);
    else list.set(edge.source, [edge.target]);
  }

  // A page's island: its first concept by title, else its wiki sub-folder, else Unsorted.
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
  for (const page of pages) {
    const named = (mentions.get(page.id) ?? []).filter((id) => conceptRank.has(id)).sort((a, b) => conceptRank.get(a)! - conceptRank.get(b)!);
    let key: string;
    if (named.length > 0) {
      const concept = conceptById.get(named[0])!;
      key = named[0];
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
  for (const source of [...(byKind.get("source") ?? [])].sort(byLabel)) {
    if (islandOfSource.has(source.id)) continue;
    claim("unread", "unread", labels.unread, null).sources.push(source.id);
  }

  // Inside each island: a sunflower, pages first.
  const positions = new Map<string, LayoutPoint>();
  const radii = new Map<string, number>();
  // A page's dot grows with the files it read, 0.85 to 1.25 page radii, scaled within the folder.
  const reads = new Map<string, number>();
  for (const page of pages) reads.set(page.id, (cites.get(page.id) ?? []).length);
  const mostRead = Math.max(1, ...reads.values());
  const leastRead = Math.min(mostRead, ...reads.values());
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

  // Islands packed about the centre: each takes the nearest free place on a spiral.
  const placed: Array<{ x: number; y: number; r: number }> = [];
  for (const island of islands) {
    if (placed.length === 0) {
      island.x = 0;
      island.y = 0;
    } else {
      let best: { x: number; y: number; d: number } | null = null;
      const step = Math.max(2, island.r / 4);
      for (let i = 0; i < 4000; i += 1) {
        const d = step * Math.sqrt(i);
        const a = i * GOLDEN_ANGLE;
        const x = Math.cos(a) * d * aspect;
        const y = Math.sin(a) * d;
        if (best && d > best.d) break;
        const free = placed.every((other) => Math.hypot(other.x - x, other.y - y) >= other.r + island.r + ISLAND_GAP);
        if (free) best = { x, y, d };
      }
      island.x = best?.x ?? 0;
      island.y = best?.y ?? 0;
    }
    placed.push({ x: island.x, y: island.y, r: island.r });
  }

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
  // A concept stands at its island's centre with no radius, so a press on the island opens
  // it; a concept no page names stands at the map's centre.
  for (const concept of concepts) {
    const island = out.find((candidate) => candidate.conceptId === concept.id);
    positions.set(concept.id, island ? { x: island.x, y: island.y } : { x: world.width / 2, y: world.height / 2 });
    radii.set(concept.id, 0);
  }
  return { positions, radii, islands: out, extent: { width: world.width, height: world.height } };
}
