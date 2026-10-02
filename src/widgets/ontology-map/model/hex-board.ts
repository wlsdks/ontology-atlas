/**
 * The hex board (design spec "F2"): one capability per tile, a domain as a contiguous region
 * round its title tile, the project at the centre, and empty moat cells between regions that
 * carry every route. Elements count toward their most-specific capability (`readContainmentTree`).
 * Placement is append-only: a kept record is honoured, a new domain takes the next spiral
 * slot and a new capability its region's first free cell; only an overflow re-seeds, and it
 * is reported (`reflowed`). A name is drawn only at cell sizes where every name fits its
 * face, never clipped. Unit space; maths in `model/hex-grid.ts`.
 */

import {
  readContainmentTree,
  rollDependencies,
  rollDomainFlows,
  type DomainFlow,
  type TreeInputEdge,
  type TreeInputNode,
} from "./containment-tree";
import {
  axialRound,
  axialToUnit,
  hexDistance,
  hexHalfWidthAt,
  hexKey,
  hexSpiral,
  HEX_NEIGHBORS,
  ringsFor,
  SQRT3,
  type Axial,
} from "./hex-grid";


type HexTileKind = "project" | "domain" | "capability";

/** So the renderer answers with its real fonts. */
export type HexTextRole = "capability" | "capabilityStrong" | "domain" | "meta" | "project" | "mono" | "plate" | "plateMeta";

/** CSS px per role; the floor is 11 px (spec §5). */
export const HEX_TYPE = {
  capability: 11.5,
  domain: 14,
  meta: 11,
  project: 13,
  mono: 11,
  plate: 12,
  plateMeta: 11,
} as const;

/** `reg` is the region radius the seeds were spaced for; only a reflow changes it. */
export interface HexPlacementRecord {
  version: 1;
  reg: number;
  seeds: Record<string, [number, number]>;
  cells: Record<string, [number, number]>;
}


export interface HexTile {
  id: string;
  kind: HexTileKind;
  name: string;
  q: number;
  r: number;
  x: number;
  y: number;
  /** A domain's own id for its title tile; null for the project. */
  domainId: string | null;
  elementCount: number;
  elementIds: readonly string[];
  /** 0, 1–2, 3–4, 5–6, 7+. */
  bucket: number;
  /** Ring distance from the project cell, the arrival stagger. */
  ring: number;
}

interface HexRegion {
  domainId: string;
  seed: Axial;
  /** Title tile first, then capabilities. */
  cells: Axial[];
  capabilityIds: string[];
  elementCount: number;
}

interface HexDependency {
  from: string;
  to: string;
}

type HexCanal = DomainFlow;

export interface HexBoardLayout {
  project: HexTile | null;
  domains: HexTile[];
  capabilities: HexTile[];
  tiles: HexTile[];
  byId: ReadonlyMap<string, HexTile>;
  occupied: ReadonlyMap<string, string>;
  regions: HexRegion[];
  /** Element ends rolled up to their capability. */
  dependencies: HexDependency[];
  /** Opposite directions merged. */
  canals: HexCanal[];
  /** Cell outlines included. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  reg: number;
  reflowed: boolean;
  record: HexPlacementRecord;
}


const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function hexBucket(elementCount: number): number {
  if (elementCount <= 0) return 0;
  if (elementCount <= 2) return 1;
  if (elementCount <= 4) return 2;
  if (elementCount <= 6) return 3;
  return 4;
}


interface Placement {
  seeds: Map<string, Axial>;
  cells: Map<string, Axial>;
  reg: number;
  homeless: string[];
}

function ringSeeds(domainIds: readonly string[], reg: number, stretch: number): Map<string, Axial> {
  const seeds = new Map<string, Axial>();
  const n = domainIds.length;
  const S = reg + 2;
  const sx = 1.05 * stretch;
  const sy = 0.95;
  const taken = new Set<string>(["0,0"]);
  domainIds.forEach((id, i) => {
    const th = ((-90 + 180 / n + (360 * i) / n) * Math.PI) / 180;
    const px = S * Math.cos(th) * sx;
    const py = S * Math.sin(th) * sy;
    const q = px / 1.5;
    const r = py / SQRT3 - q / 2;
    let cell = axialRound(q, r);
    // Two seeds never share a cell (possible only on tiny, crowded rings).
    for (let bump = 0; taken.has(hexKey(cell[0], cell[1])); bump += 1) cell = [cell[0] + 1, cell[1]];
    taken.add(hexKey(cell[0], cell[1]));
    seeds.set(id, cell);
  });
  return seeds;
}

function spiralSeed(slot: number, k: number): Axial {
  const s = hexSpiral(slot + 1)[slot]!;
  return [s[0] * k, s[1] * k];
}

/** Far enough from every seed and the project that its region keeps the common margin. */
function nextFreeSeed(existing: readonly Axial[], k: number): Axial {
  for (let slot = 1; slot < 10_000; slot += 1) {
    const cand = spiralSeed(slot, k);
    if (existing.every((s) => hexDistance(s, cand) >= k)) return cand;
  }
  return spiralSeed(10_000, k);
}

/** Its nearest seed must win by ≥ 2 rings (spec §2.4). */
function makeOwner(seeds: ReadonlyMap<string, Axial>) {
  const list = [...seeds];
  return (q: number, r: number): string | null => {
    if (hexDistance([q, r], [0, 0]) <= 1) return null;
    let best: string | null = null;
    let bestD = Infinity;
    let second = Infinity;
    for (const [id, s] of list) {
      const d = hexDistance([q, r], s);
      if (d < bestD) {
        second = bestD;
        bestD = d;
        best = id;
      } else if (d < second) second = d;
    }
    return second - bestD >= 2 ? best : null;
  };
}

function place(
  domainIds: readonly string[],
  capsByDomain: ReadonlyMap<string, readonly string[]>,
  reg: number,
  stretch: number,
  prior: HexPlacementRecord | null,
): Placement {
  const k = 2 * reg + 2;
  const seeds = new Map<string, Axial>();
  if (prior) {
    for (const id of domainIds) {
      const s = prior.seeds[id];
      if (s) seeds.set(id, [s[0], s[1]]);
    }
    for (const id of domainIds) {
      if (seeds.has(id)) continue;
      seeds.set(id, nextFreeSeed([[0, 0], ...seeds.values()], k));
    }
  } else if (domainIds.length <= 6) {
    for (const [id, s] of ringSeeds(domainIds, reg, stretch)) seeds.set(id, s);
  } else {
    domainIds.forEach((id, i) => seeds.set(id, spiralSeed(i + 1, k)));
  }

  const owner = makeOwner(seeds);
  const occupied = new Set<string>(["0,0"]);
  for (const s of seeds.values()) occupied.add(hexKey(s[0], s[1]));
  const cells = new Map<string, Axial>();
  const homeless: string[] = [];
  const RAD = reg + 4;

  for (const domainId of domainIds) {
    const seed = seeds.get(domainId)!;
    const su = axialToUnit(seed[0], seed[1]);
    const spoke = Math.atan2(su.y, su.x);
    const candidates: { q: number; r: number; d: number; a: number }[] = [];
    for (let q = seed[0] - RAD; q <= seed[0] + RAD; q += 1) {
      for (let r = seed[1] - RAD; r <= seed[1] + RAD; r += 1) {
        const d = hexDistance([q, r], seed);
        if (d === 0 || d > RAD) continue;
        if (owner(q, r) !== domainId) continue;
        const u = axialToUnit(q - seed[0], r - seed[1]);
        let a = Math.atan2(u.y, u.x) - spoke;
        a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        candidates.push({ q, r, d, a });
      }
    }
    candidates.sort((u, v) => u.d - v.d || u.a - v.a || u.q - v.q || u.r - v.r);
    const regionCells = new Set<string>([hexKey(seed[0], seed[1])]);
    const caps = capsByDomain.get(domainId) ?? [];
    // A placed capability keeps its cell while the cell is still theirs to hold.
    const fresh: string[] = [];
    for (const id of caps) {
      const c = prior?.cells[id];
      const key = c ? hexKey(c[0], c[1]) : "";
      if (c && !occupied.has(key) && owner(c[0], c[1]) === domainId) {
        cells.set(id, [c[0], c[1]]);
        occupied.add(key);
        regionCells.add(key);
      } else fresh.push(id);
    }
    for (const id of fresh) {
      const pick = candidates.find(
        (c) =>
          !occupied.has(hexKey(c.q, c.r)) && HEX_NEIGHBORS.some(([dq, dr]) => regionCells.has(hexKey(c.q + dq, c.r + dr))),
      );
      if (!pick) {
        homeless.push(id);
        continue;
      }
      const key = hexKey(pick.q, pick.r);
      cells.set(id, [pick.q, pick.r]);
      occupied.add(key);
      regionCells.add(key);
    }
  }
  return { seeds, cells, reg, homeless };
}

function placementExtent(p: Placement): { w: number; h: number } {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const c of [...p.seeds.values(), ...p.cells.values()]) {
    const u = axialToUnit(c[0], c[1]);
    minX = Math.min(minX, u.x);
    maxX = Math.max(maxX, u.x);
    minY = Math.min(minY, u.y);
    maxY = Math.max(maxY, u.y);
  }
  return { w: maxX - minX + 2, h: maxY - minY + SQRT3 };
}

/**
 * A first ring placement tries a few sideways stretches and keeps the largest cell at fit,
 * so a wide screen gets a wide board; a kept record or spiral board is placed as is.
 */
function placeFitted(
  domainIds: readonly string[],
  capsByDomain: ReadonlyMap<string, readonly string[]>,
  reg: number,
  aspect: number,
  prior: HexPlacementRecord | null,
): Placement {
  if (prior || domainIds.length > 6) return place(domainIds, capsByDomain, reg, 1, prior);
  let best: Placement | null = null;
  let bestScore = -Infinity;
  for (const stretch of [1, 1.12, 1.25, 1.38, 1.5, 1.62]) {
    const p = place(domainIds, capsByDomain, reg, stretch, null);
    if (p.homeless.length) continue;
    const { w, h } = placementExtent(p);
    const score = Math.min(aspect / w, 1 / h);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? place(domainIds, capsByDomain, reg, 1, null);
}

export interface HexBoardOptions {
  /** Honoured; the result carries the next one. */
  prior?: HexPlacementRecord | null;
  /** Width ÷ height of the first room; only a first placement reads it. */
  aspect?: number;
}

/** Total-ordered: the same graph and prior record always give the same board. */
export function computeHexBoard(
  nodes: readonly TreeInputNode[],
  edges: readonly TreeInputEdge[],
  options: HexBoardOptions = {},
): HexBoardLayout {
  const tree = readContainmentTree(nodes, edges);
  const label = new Map(nodes.map((n) => [n.id, n.label] as const));
  const domainIds = tree.domains.map((d) => d.id);
  const capsByDomain = new Map<string, string[]>();
  for (const c of tree.capabilities) {
    const d = tree.capabilityDomain.get(c.id);
    if (!d) continue;
    const list = capsByDomain.get(d);
    if (list) list.push(c.id);
    else capsByDomain.set(d, [c.id]);
  }
  for (const list of capsByDomain.values()) list.sort(byString);
  const maxCaps = Math.max(0, ...[...capsByDomain.values()].map((l) => l.length));
  const aspect = options.aspect ?? 1.35;

  let prior = options.prior && options.prior.version === 1 ? options.prior : null;
  let reg = Math.max(1, prior ? prior.reg : ringsFor(maxCaps));
  let placement = placeFitted(domainIds, capsByDomain, reg, aspect, prior);
  let reflowed = false;
  // Overflow re-seeds the whole board with wider spacing, the only reflow.
  for (let guard = 0; placement.homeless.length > 0 && guard < 12; guard += 1) {
    reflowed = true;
    prior = null;
    reg += 1;
    placement = placeFitted(domainIds, capsByDomain, reg, aspect, null);
  }

  const tiles: HexTile[] = [];
  const occupied = new Map<string, string>();
  const tile = (id: string, kind: HexTileKind, cell: Axial, domainId: string | null, elementIds: readonly string[]): HexTile => {
    const u = axialToUnit(cell[0], cell[1]);
    const t: HexTile = {
      id,
      kind,
      name: label.get(id) ?? id,
      q: cell[0],
      r: cell[1],
      x: u.x,
      y: u.y,
      domainId,
      elementCount: elementIds.length,
      elementIds,
      bucket: kind === "capability" ? hexBucket(elementIds.length) : 0,
      ring: hexDistance(cell, [0, 0]),
    };
    tiles.push(t);
    occupied.set(hexKey(cell[0], cell[1]), id);
    return t;
  };

  const project = tree.project ? tile(tree.project.id, "project", [0, 0], null, []) : null;
  const domains: HexTile[] = [];
  const regions: HexRegion[] = [];
  for (const id of domainIds) {
    const seed = placement.seeds.get(id)!;
    domains.push(tile(id, "domain", seed, id, []));
  }
  const capabilities: HexTile[] = [];
  for (const id of domainIds) {
    const seed = placement.seeds.get(id)!;
    const region: HexRegion = { domainId: id, seed, cells: [seed], capabilityIds: [], elementCount: 0 };
    for (const capId of capsByDomain.get(id) ?? []) {
      const cell = placement.cells.get(capId);
      if (!cell) continue;
      const els = [...(tree.capabilityElements.get(capId) ?? [])].sort(byString);
      capabilities.push(tile(capId, "capability", cell, id, els));
      region.cells.push(cell);
      region.capabilityIds.push(capId);
    }
    region.elementCount = tree.domainElementCount.get(id) ?? 0;
    regions.push(region);
  }

  const byId = new Map(tiles.map((t) => [t.id, t] as const));
  const dependencies: HexDependency[] = [];
  const seenDep = new Set<string>();
  for (const d of rollDependencies(tree, edges)) {
    if (!byId.has(d.from) || !byId.has(d.to)) continue;
    const key = `${d.from}\0${d.to}`;
    if (seenDep.has(key)) continue;
    seenDep.add(key);
    dependencies.push({ from: d.from, to: d.to });
  }

  const canals = rollDomainFlows(dependencies, (id) => byId.get(id)?.domainId);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    minX = Math.min(minX, t.x - 1);
    maxX = Math.max(maxX, t.x + 1);
    minY = Math.min(minY, t.y - SQRT3 / 2);
    maxY = Math.max(maxY, t.y + SQRT3 / 2);
  }
  if (tiles.length === 0) {
    minX = -1;
    maxX = 1;
    minY = -1;
    maxY = 1;
  }

  const record: HexPlacementRecord = { version: 1, reg: placement.reg, seeds: {}, cells: {} };
  // Kept for concepts no longer on the board: a hole stays a hole and a returning domain finds its plate.
  if (prior && !reflowed) {
    for (const [id, s] of Object.entries(prior.seeds)) record.seeds[id] = [s[0], s[1]];
    for (const [id, c] of Object.entries(prior.cells)) if (!byId.has(id)) record.cells[id] = [c[0], c[1]];
  }
  for (const [id, s] of placement.seeds) record.seeds[id] = [s[0], s[1]];
  for (const [id, c] of placement.cells) record.cells[id] = [c[0], c[1]];
  // A kept hole must not be claimed twice.
  for (const [id, c] of Object.entries(record.cells)) {
    const holder = occupied.get(hexKey(c[0], c[1]));
    if (holder && holder !== id) delete record.cells[id];
  }

  return {
    project,
    domains,
    capabilities,
    tiles,
    byId,
    occupied,
    regions,
    dependencies,
    canals,
    bounds: { minX, maxX, minY, maxY },
    reg: placement.reg,
    reflowed,
    record,
  };
}


/** Largest cell size at rest (spec §1). */
const HEX_MAX_FIT_RADIUS = 60;
/** The zoom clamp (spec §6). */
export const HEX_MIN_RADIUS = 8;
export const HEX_MAX_RADIUS = 96;
/** Semantic zoom thresholds (spec §7). */
export const HEX_BAND_PIPS = 28;
export const HEX_BAND_NAMES = 44;

export function fitHexRadius(bounds: HexBoardLayout["bounds"], room: { width: number; height: number }): number {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const r = Math.floor(Math.min(room.width / w, room.height / h));
  return Math.max(HEX_MIN_RADIUS, Math.min(HEX_MAX_FIT_RADIUS, r));
}

/** Routes run in the 2·GUT gap between faces. */
export function hexGutter(R: number): number {
  return R >= 44 ? 4 : R >= 28 ? 3 : 1.5;
}

export type HexBand = "regions" | "pips" | "names";

export function hexBandFor(R: number, namesFrom: number): HexBand {
  if (R >= namesFrom) return "names";
  if (R >= HEX_BAND_PIPS) return "pips";
  return "regions";
}


export type HexMeasure = (text: string, role: HexTextRole) => number;

export interface HexTextLine {
  text: string;
  role: HexTextRole;
  /** CSS px, y down. */
  dy: number;
  /** Takes the stale ink when its count is not zero. */
  tone?: "stale";
}

/** A single word longer than `maxW` stays whole and fails the fit. */
function wrapWords(text: string, role: HexTextRole, maxW: number, measure: HexMeasure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || measure(t, role) <= maxW) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function balancedTwoLines(text: string, role: HexTextRole, measure: HexMeasure): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let best: string[] | null = null;
  let bestW = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const w = Math.max(measure(a, role), measure(b, role));
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
}

/** `staleFile` lifts a capability's name to make room for the moved file's name (spec §5). */
export function hexTileLines(
  tile: Pick<HexTile, "kind" | "name">,
  R: number,
  measure: HexMeasure,
  extras: { meta?: string; stale?: string; staleFile?: string | null; strong?: boolean } = {},
): HexTextLine[] {
  if (tile.kind === "capability") {
    const role: HexTextRole = extras.strong ? "capabilityStrong" : "capability";
    const lift = extras.staleFile ? -6 : 0;
    const place = (lines: readonly string[]): HexTextLine[] => {
      const base = lines.length === 1 ? [1] : [-6, 8];
      const out: HexTextLine[] = lines.slice(0, 2).map((text, i) => ({ text, role, dy: base[i]! + lift }));
      if (lines.length > 2) out.push({ text: lines.slice(2).join(" "), role, dy: 22 + lift });
      if (extras.staleFile) out.push({ text: extras.staleFile, role: "mono", dy: 19 });
      return out;
    };
    // Word wrap at 1.45R first; when that spills where the hexagon narrows, the most even
    // two-line split. The fit check decides, never a clip.
    const greedy = place(wrapWords(tile.name, role, 1.45 * R, measure));
    if (hexLineSpills(greedy, R, measure).length === 0) return greedy;
    const even = balancedTwoLines(tile.name, role, measure);
    if (even) {
      const lines = place(even);
      if (hexLineSpills(lines, R, measure).length === 0) return lines;
    }
    return greedy;
  }
  if (tile.kind === "domain") {
    const lines = wrapWords(tile.name, "domain", 1.25 * R, measure);
    const two = lines.length > 1;
    // Two title lines sit 2 px above the spec's −17/−1 so the counts line lands where the face
    // is wide enough at 1280; with no counts the name centres where the face is widest.
    const bare = !extras.meta && !extras.stale;
    const title = bare ? (two ? [-4, 12] : [5]) : two ? [-19, -3] : [-6];
    const out: HexTextLine[] = lines.slice(0, 2).map((text, i) => ({ text, role: "domain", dy: title[i]! }));
    if (lines.length > 2) out.push({ text: lines.slice(2).join(" "), role: "domain", dy: 15 });
    const metaY = two ? 13 : 12;
    if (extras.meta) out.push({ text: extras.meta, role: "meta", dy: metaY });
    if (extras.stale) out.push({ text: extras.stale, role: "meta", dy: metaY + 15, tone: "stale" });
    return out;
  }
  const lines = wrapWords(tile.name, "project", 1.3 * R, measure);
  const base = lines.length === 1 ? [-2] : [-9, 7];
  const out: HexTextLine[] = lines.slice(0, 2).map((text, i) => ({ text, role: "project", dy: base[i]! }));
  if (lines.length > 2) out.push({ text: lines.slice(2).join(" "), role: "project", dy: 23 });
  if (extras.meta) out.push({ text: extras.meta, role: "meta", dy: base[base.length - 1]! + 17 });
  return out;
}

const ASCENT = 0.85;
const DESCENT = 0.22;

/**
 * Half-width at each line's top and bottom edges, `2·(RI − |dy|/√3) − 8` (− 4 for counts).
 * A spill is an error (spec §5).
 */
export function hexLineSpills(lines: readonly HexTextLine[], R: number, measure: HexMeasure): HexTextLine[] {
  const RI = R - hexGutter(R);
  const apothem = (RI * SQRT3) / 2;
  const out: HexTextLine[] = [];
  for (const line of lines) {
    const size = HEX_TYPE[line.role === "capabilityStrong" ? "capability" : line.role];
    const top = line.dy - size * ASCENT;
    const bottom = line.dy + size * DESCENT;
    if (Math.abs(top) > apothem || Math.abs(bottom) > apothem) {
      out.push(line);
      continue;
    }
    // Counts are short numerals the rim cannot clip, so they get the tighter −4.
    const avail = 2 * Math.min(hexHalfWidthAt(RI, top), hexHalfWidthAt(RI, bottom)) - (line.role === "meta" ? 4 : 8);
    if (measure(line.text, line.role) > avail) out.push(line);
  }
  return out;
}

/** Between 44 and 96, or null when some name never fits; the names band starts here. */
export function minNamesRadius(
  layout: HexBoardLayout,
  measure: HexMeasure,
  extrasFor: (tile: HexTile) => Parameters<typeof hexTileLines>[3] = () => ({}),
): number | null {
  for (let R = HEX_BAND_NAMES; R <= HEX_MAX_RADIUS; R += 1) {
    let ok = true;
    for (const t of layout.tiles) {
      if (hexLineSpills(hexTileLines(t, R, measure, extrasFor(t)), R, measure).length > 0) {
        ok = false;
        break;
      }
    }
    if (ok) return R;
  }
  return null;
}

/** The extension carries meaning (spec §5). */
export function middleTruncate(text: string, maxW: number, measure: (t: string) => number): string {
  if (measure(text) <= maxW) return text;
  const chars = [...text];
  for (let keep = chars.length - 1; keep >= 3; keep -= 1) {
    const head = Math.ceil(keep * 0.55);
    const tail = keep - head;
    const t = `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
    if (measure(t) <= maxW) return t;
  }
  return "…";
}


export type HexWalkDirection = "up" | "down" | "left" | "right";

/**
 * ↑/↓ are axial `(0,∓1)`; → is `(1,0)` or `(1,−1)`, whichever is nearer the starting row
 * (← mirrors). With no neighbour that way, the walk crosses the moat to the nearest tile
 * (projection plus a doubled orthogonal penalty, the flat map's rule) (spec §6).
 */
export function hexNeighborInDirection(
  layout: HexBoardLayout,
  fromId: string,
  direction: HexWalkDirection,
  rowY: number | null = null,
): string | null {
  const from = layout.byId.get(fromId);
  if (!from) return null;
  const at = (dq: number, dr: number) => layout.occupied.get(hexKey(from.q + dq, from.r + dr)) ?? null;
  const row = rowY ?? from.y;
  let direct: string | null = null;
  if (direction === "up") direct = at(0, -1);
  else if (direction === "down") direct = at(0, 1);
  else {
    const s = direction === "right" ? 1 : -1;
    const a = at(s, 0);
    const b = at(s, -s);
    const ay = from.y + (SQRT3 / 2) * s;
    const by = from.y - (SQRT3 / 2) * s;
    const aNear = Math.abs(ay - row) <= Math.abs(by - row);
    direct = aNear ? (a ?? b) : (b ?? a);
  }
  if (direct) return direct;
  const axis = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
  let best: string | null = null;
  let bestCost = Infinity;
  for (const t of layout.tiles) {
    if (t.id === fromId) continue;
    const dx = t.x - from.x;
    const dy = t.y - from.y;
    const along = dx * axis[0]! + dy * axis[1]!;
    if (along <= 0) continue;
    const across = Math.abs(dx * axis[1]! - dy * axis[0]!);
    if (across > along * Math.tan(Math.PI / 3)) continue;
    const cost = along + across * 2;
    if (cost < bestCost || (cost === bestCost && best !== null && t.id < best)) {
      bestCost = cost;
      best = t.id;
    }
  }
  return best;
}
