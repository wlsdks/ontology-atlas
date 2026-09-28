/**
 * Territories: the flat map with nothing folded, so "which domain owns this" is read from
 * position (owner spec "A v2"). Elements belong to their most-specific capability and appear
 * only as satellites of a selected one. Each domain owns an angular sector with its
 * capabilities on open shelves, never a hull. Every disc, name, title and pill is a box
 * accepted only where it touches no placed box: greedy, total-ordered, over a spatial-hash
 * grid, about O(N × candidates). Dependencies roll up per ordered domain pair into one
 * stroke with a count. Past `maxShelves` or `denseDomainCount` names wait for hover. Inside
 * a room the spacing draws in before names fold, and only discs that cannot fit let the
 * drawing grow past it. CSS px at a fixed label scale; the view pans, never zooms.
 */

type TerritoryKind = "project" | "domain" | "capability" | "element";

export interface TerritoryInputNode {
  id: string;
  label: string;
  kind: TerritoryKind;
}

export interface TerritoryInputEdge {
  source: string;
  target: string;
  /** `belongs_to` states containment from the child's side. */
  kind: "contains" | "depends";
  relationType: string;
}

/** So the renderer can answer with its real fonts. */
export type TerritoryTextRole = "project" | "domain" | "domainStats" | "capability" | "element" | "chip";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TerritoryLayoutOptions {
  measure: (text: string, role: TerritoryTextRole) => number;
  /** The page composes the counts line; layout needs only its width. */
  domainStats: (domain: {
    id: string;
    capabilityIds: readonly string[];
    capabilityCount: number;
    elementCount: number;
  }) => string;
  /**
   * Relative to the project centre. When the vault does not fit, the layout is recomputed
   * without it (the camera pans) rather than dropping anything.
   */
  room?: Box | null;
}

export interface TerritoryLabel {
  text: string;
  /** `x` per `align`, `y` the alphabetic baseline. */
  x: number;
  y: number;
  align: "left" | "right" | "center";
  box: Box;
}

interface TerritoryProject {
  id: string;
  label: TerritoryLabel;
  x: number;
  y: number;
  r: number;
}

interface TerritoryDomain {
  id: string;
  name: string;
  x: number;
  y: number;
  half: number;
  /** Radians, y down. */
  angle: number;
  sectorStart: number;
  sectorEnd: number;
  capabilityIds: string[];
  capabilityCount: number;
  elementCount: number;
  label: TerritoryLabel;
  stats: TerritoryLabel;
}

export interface TerritoryCapability {
  id: string;
  name: string;
  domainId: string | null;
  x: number;
  y: number;
  r: number;
  /** Radians about its domain mark. */
  angle: number;
  shelf: number;
  elementIds: string[];
  /** Drawn as a dot in the disc. */
  hasDependency: boolean;
  label: TerritoryLabel;
  /** False in dense mode and for names that did not fit the room (hover and focus only). */
  labelReserved: boolean;
}

interface TerritoryShelf {
  domainId: string;
  cx: number;
  cy: number;
  radius: number;
  from: number;
  to: number;
}

export interface TerritoryDependency {
  /** An element's dependency rolls up to its capability. */
  from: string;
  to: string;
  sourceId: string;
  targetId: string;
}

interface TerritoryRollup {
  fromDomain: string;
  toDomain: string;
  count: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  chip: TerritoryLabel;
}

export interface TerritoryLayout {
  project: TerritoryProject | null;
  domains: TerritoryDomain[];
  capabilities: TerritoryCapability[];
  shelves: TerritoryShelf[];
  /** The domain when no capability lists the element. */
  elementParent: Map<string, string>;
  dependencies: TerritoryDependency[];
  rollups: TerritoryRollup[];
  dense: boolean;
  /** Always false without a room. */
  fitsRoom: boolean;
  /** The set the no-overlap rule was checked against. */
  boxes: { id: string; role: "mark" | "label" | "chip"; box: Box }[];
  bounds: Box;
}

const DEG = Math.PI / 180;

/** Tuned on 1512×949; the unit tests check the rules, not these numbers. */
export const TERRITORY_GEOMETRY = {
  projectRadius: 30,
  domainRing: 190,
  /** Screens are wider than tall. */
  squash: 0.86,
  shelfRadius: 138,
  shelfStep: 78,
  sectorGap: 20 * DEG,
  searchStep: 0.75 * DEG,
  pad: 6,
  domainHalf: 20,
  maxShelves: 7,
  denseDomainCount: 10,
  /** A safety bound, never reached in practice. */
  denseShelfLimit: 400,
  /** Once its name has folded to hover. */
  foldedShelfLimit: 14,
  /** Widest first; the ring and shelves draw in, never the type. */
  roomSpreads: [1, 0.86, 0.74, 0.64],
  capabilityFontPx: 11,
  domainFontPx: 15,
  domainStatsFontPx: 10,
  projectFontPx: 15,
  chipFontPx: 10,
  chipHeight: 18,
  chipMinWidth: 26,
  /**
   * Pull of the control point toward the hub, sideways bow for a chord through the hub, and
   * the offset that keeps A→B and B→A apart.
   */
  rollupPull: 0.55,
  rollupHubRadius: 60,
  rollupBow: 150,
  rollupPairGap: 22,
  satelliteGap: 14,
  satelliteRow: 16,
} as const;

function capabilityRadius(elementCount: number): number {
  return 7 + 1.7 * elementCount;
}


const CELL = 64;

class BoxGrid {
  private cells = new Map<string, Box[]>();
  readonly all: { id: string; role: "mark" | "label" | "chip"; box: Box }[] = [];

  constructor(private readonly room: Box | null) {}

  private keys(b: Box): string[] {
    const out: string[] = [];
    const x0 = Math.floor(b.x / CELL);
    const x1 = Math.floor((b.x + b.w) / CELL);
    const y0 = Math.floor(b.y / CELL);
    const y1 = Math.floor((b.y + b.h) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`${x},${y}`);
    return out;
  }

  outside(b: Box): boolean {
    const r = this.room;
    return !!r && (b.x < r.x || b.y < r.y || b.x + b.w > r.x + r.w || b.y + b.h > r.y + r.h);
  }

  hits(b: Box, pad: number = TERRITORY_GEOMETRY.pad): boolean {
    if (this.outside(b)) return true;
    const p = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
    for (const key of this.keys(p)) {
      const list = this.cells.get(key);
      if (!list) continue;
      for (const o of list) if (boxesOverlap(p, o)) return true;
    }
    return false;
  }

  popTo(count: number): void {
    while (this.all.length > count) for (const key of this.keys(this.all.pop()!.box)) this.cells.get(key)!.pop();
  }

  add(id: string, role: "mark" | "label" | "chip", b: Box): void {
    this.all.push({ id, role, box: b });
    for (const key of this.keys(b)) {
      const list = this.cells.get(key);
      if (list) list.push(b);
      else this.cells.set(key, [b]);
    }
  }
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}


export interface Tree {
  project: TerritoryInputNode | null;
  domains: TerritoryInputNode[];
  capabilityDomain: Map<string, string | null>;
  capabilities: TerritoryInputNode[];
  elementParent: Map<string, string>;
  capabilityElements: Map<string, string[]>;
  domainElementCount: Map<string, number>;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byLabel = (a: { label: string; id: string }, b: { label: string; id: string }) =>
  a.label < b.label ? -1 : a.label > b.label ? 1 : byId(a, b);

export function readTree(nodes: readonly TerritoryInputNode[], edges: readonly TerritoryInputEdge[]): Tree {
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind] as const));
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "contains") continue;
    if (!kindOf.has(e.source) || !kindOf.has(e.target)) continue;
    const [parent, child] = e.relationType === "belongs_to" ? [e.target, e.source] : [e.source, e.target];
    const list = parents.get(child);
    if (list) list.push(parent);
    else parents.set(child, [parent]);
  }
  for (const list of parents.values()) list.sort();
  const firstParentOfKind = (id: string, kind: TerritoryKind) =>
    (parents.get(id) ?? []).find((p) => kindOf.get(p) === kind) ?? null;

  const project = nodes.filter((n) => n.kind === "project").sort(byId)[0] ?? null;
  const domains = nodes.filter((n) => n.kind === "domain").sort(byId);
  const capabilities = nodes.filter((n) => n.kind === "capability").sort(byId);

  const capabilityDomain = new Map<string, string | null>();
  for (const c of capabilities) capabilityDomain.set(c.id, firstParentOfKind(c.id, "domain"));

  // A capability that lists the element wins over a domain that also does.
  const elementParent = new Map<string, string>();
  const capabilityElements = new Map<string, string[]>();
  const domainElementCount = new Map<string, number>();
  for (const el of nodes.filter((n) => n.kind === "element").sort(byId)) {
    const cap = firstParentOfKind(el.id, "capability");
    const dom = cap ? capabilityDomain.get(cap) ?? null : firstParentOfKind(el.id, "domain");
    const owner = cap ?? dom;
    if (owner) elementParent.set(el.id, owner);
    if (cap) {
      const list = capabilityElements.get(cap);
      if (list) list.push(el.id);
      else capabilityElements.set(cap, [el.id]);
    }
    if (dom) domainElementCount.set(dom, (domainElementCount.get(dom) ?? 0) + 1);
  }
  return { project, domains, capabilityDomain, capabilities, elementParent, capabilityElements, domainElementCount };
}

export function rollDependencies(tree: Tree, edges: readonly TerritoryInputEdge[]): TerritoryDependency[] {
  const isCapability = new Set(tree.capabilities.map((c) => c.id));
  const toCapability = (id: string): string | null => {
    if (isCapability.has(id)) return id;
    const owner = tree.elementParent.get(id);
    return owner && isCapability.has(owner) ? owner : null;
  };
  const out: TerritoryDependency[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.kind === "contains" || e.relationType !== "depends_on") continue;
    const from = toCapability(e.source);
    const to = toCapability(e.target);
    if (!from || !to || from === to) continue;
    const key = `${e.source}\0${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to, sourceId: e.source, targetId: e.target });
  }
  return out.sort((a, b) => (a.sourceId + a.targetId < b.sourceId + b.targetId ? -1 : 1));
}


function onArc(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * TERRITORY_GEOMETRY.squash * Math.sin(angle) };
}

/** Always outside its shelf, on its own radial. */
function capabilityLabelAt(x: number, y: number, r: number, angle: number, text: string, width: number): TerritoryLabel {
  const L = TERRITORY_GEOMETRY.capabilityFontPx;
  const h = L + 2;
  const cos = Math.cos(angle);
  if (cos > 0.35) return { text, x: x + r + 7, y: y + 4, align: "left", box: { x: x + r + 7, y: y - 8, w: width, h } };
  if (cos < -0.35) return { text, x: x - r - 7, y: y + 4, align: "right", box: { x: x - r - 7 - width, y: y - 8, w: width, h } };
  const baseline = Math.sin(angle) < 0 ? y - r - 6 : y + r + 15;
  return { text, x, y: baseline, align: "center", box: { x: x - width / 2, y: baseline - L, w: width, h } };
}

interface Attempt {
  layout: TerritoryLayout;
  complete: boolean;
}

type NameRule = "keepEvery" | "foldWithoutPlace" | "yieldToDiscs";

function attempt(
  tree: Tree,
  dependencies: readonly TerritoryDependency[],
  options: TerritoryLayoutOptions,
  room: Box | null,
  dense: boolean,
  names: NameRule = "keepEvery",
  /** 1 is the tuned spacing; names keep one size. */
  spread = 1,
): Attempt {
  const G = TERRITORY_GEOMETRY;
  const grid = new BoxGrid(room);
  const measure = options.measure;
  const denseRing = Math.max(G.domainRing, 36 * tree.domains.length);
  const ring = (dense ? denseRing : G.domainRing) * spread;
  const shelfRadius = G.shelfRadius * spread;
  const shelfStep = G.shelfStep * spread;

  let project: TerritoryProject | null = null;
  if (tree.project) {
    const r = G.projectRadius;
    grid.add(tree.project.id, "mark", { x: -r - 4, y: -r - 4, w: 2 * r + 8, h: 2 * r + 8 });
    const w = measure(tree.project.label, "project");
    const baseline = r + 26;
    const box = { x: -w / 2, y: baseline - G.projectFontPx, w, h: G.projectFontPx + 4 };
    grid.add(tree.project.id, "label", box);
    project = { id: tree.project.id, x: 0, y: 0, r, label: { text: tree.project.label, x: 0, y: baseline, align: "center", box } };
  }

  /* Capabilities no domain holds get a territory too. */
  interface Territory {
    id: string;
    name: string;
    domain: boolean;
    caps: TerritoryInputNode[];
  }
  const territories: Territory[] = tree.domains.map((d) => ({ id: d.id, name: d.label, domain: true, caps: [] }));
  const byDomain = new Map(territories.map((t) => [t.id, t]));
  const orphan: Territory = { id: "", name: "", domain: false, caps: [] };
  for (const c of tree.capabilities) {
    const d = tree.capabilityDomain.get(c.id);
    (d ? byDomain.get(d) ?? orphan : orphan).caps.push(c);
  }
  if (orphan.caps.length > 0) territories.push(orphan);
  // Largest territory first, then by name.
  territories.sort((a, b) => b.caps.length - a.caps.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));

  const weights = territories.map((t) => t.caps.length + 2);
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  // Many territories share the circle, so the gap never takes more than half of it.
  const gap = territories.length > 1 ? Math.min(G.sectorGap, Math.PI / territories.length) : 0;
  const avail = 2 * Math.PI - gap * territories.length;
  let cursor = -45 * DEG - (avail * weights[0]!) / wsum / 2;
  const sectors = territories.map((t, i) => {
    const span = (avail * weights[i]!) / wsum;
    const s = { t, start: cursor, end: cursor + span, mid: cursor + span / 2 };
    cursor += span + gap;
    return s;
  });

  /* Titles on the outward-vertical side, reading outward. */
  const domains: TerritoryDomain[] = [];
  const markOf = new Map<Territory, { x: number; y: number }>();
  for (const s of sectors) {
    const m = s.t.domain || territories.length > 1 ? onArc(0, 0, ring, s.mid) : { x: 0, y: 0 };
    markOf.set(s.t, m);
    if (!s.t.domain) continue;
    const half = G.domainHalf;
    grid.add(s.t.id, "mark", { x: m.x - half, y: m.y - half, w: 2 * half, h: 2 * half });
    const elementCount = tree.domainElementCount.get(s.t.id) ?? 0;
    const statsText = options.domainStats({
      id: s.t.id,
      capabilityIds: s.t.caps.map((c) => c.id),
      capabilityCount: s.t.caps.length,
      elementCount,
    });
    const nameW = measure(s.t.name, "domain");
    const statsW = measure(statsText, "domainStats");
    const w = Math.max(nameW, statsW);
    const up = Math.sin(s.mid) < 0;
    const right = Math.cos(s.mid) >= 0;
    const tx = right ? m.x - half : m.x + half;
    // The block spans ty − 16 … ty + 16 and clears the mark on either side.
    const ty = up ? m.y - half - 18 : m.y + half + 24;
    const align = right ? ("left" as const) : ("right" as const);
    const left = right ? tx : tx - w;
    grid.add(s.t.id, "label", { x: left, y: ty - 16, w, h: 32 });
    domains.push({
      id: s.t.id,
      name: s.t.name,
      x: m.x,
      y: m.y,
      half,
      angle: s.mid,
      sectorStart: s.start,
      sectorEnd: s.end,
      capabilityIds: [],
      capabilityCount: s.t.caps.length,
      elementCount,
      label: { text: s.t.name, x: tx, y: ty - 2, align, box: { x: right ? tx : tx - nameW, y: ty - 16, w: nameW, h: G.domainFontPx + 2 } },
      stats: { text: statsText, x: tx, y: ty + 13, align, box: { x: right ? tx : tx - statsW, y: ty + 4, w: statsW, h: G.domainStatsFontPx + 2 } },
    });
  }
  const domainById = new Map(domains.map((d) => [d.id, d]));

  /* Before capabilities, since the pills are obstacles. */
  const capDomain = new Map<string, string | null>();
  for (const c of tree.capabilities) capDomain.set(c.id, tree.capabilityDomain.get(c.id) ?? null);
  const counts = new Map<string, number>();
  const seenPair = new Set<string>();
  for (const dep of dependencies) {
    const a = capDomain.get(dep.from);
    const b = capDomain.get(dep.to);
    if (!a || !b || a === b || !domainById.has(a) || !domainById.has(b)) continue;
    // Two element edges between the same capabilities count once.
    const capKey = `${dep.from}\0${dep.to}`;
    if (seenPair.has(capKey)) continue;
    seenPair.add(capKey);
    const key = `${a}\0${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rollups: TerritoryRollup[] = [];
  for (const key of [...counts.keys()].sort()) {
    const [fromDomain, toDomain] = key.split("\0") as [string, string];
    const a = domainById.get(fromDomain)!;
    const b = domainById.get(toDomain)!;
    const count = counts.get(key)!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Oriented up so both directions agree on the perpendicular.
    const [p, q] = fromDomain < toDomain ? [a, b] : [b, a];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    let nx = -(q.y - p.y) / len;
    let ny = (q.x - p.x) / len;
    if (ny > 0 || (ny === 0 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    let cx: number;
    let cy: number;
    if (Math.hypot(mx, my) < G.rollupHubRadius) {
      // Near-opposite marks: the chord crosses the hub, so bow up, clear of its name.
      cx = mx + nx * G.rollupBow;
      cy = my + ny * G.rollupBow;
    } else {
      cx = mx - mx * G.rollupPull;
      cy = my - my * G.rollupPull;
    }
    if (fromDomain > toDomain && counts.has(`${toDomain}\0${fromDomain}`)) {
      cx += nx * G.rollupPairGap;
      cy += ny * G.rollupPairGap;
    }
    const text = String(count);
    const w = Math.max(G.chipMinWidth, measure(text, "chip") + 14);
    const h = G.chipHeight;
    const at = (t: number) => ({
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y,
    });
    let chip: TerritoryLabel | null = null;
    for (const t of [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68]) {
      const pt = at(t);
      const box = { x: pt.x - w / 2, y: pt.y - h / 2, w, h };
      if (!grid.hits(box, 1)) {
        chip = { text, x: pt.x, y: pt.y + 3.5, align: "center", box };
        break;
      }
    }
    if (!chip) {
      const pt = at(0.5);
      chip = { text, x: pt.x, y: pt.y + 3.5, align: "center", box: { x: pt.x - w / 2, y: pt.y - h / 2, w, h } };
    }
    grid.add(key, "chip", chip.box);
    rollups.push({ fromDomain, toDomain, count, x1: a.x, y1: a.y, cx, cy, x2: b.x, y2: b.y, chip });
  }

  /* Shelf by shelf, from the sector's centre line outward, alternating sides. */
  const capabilities: TerritoryCapability[] = [];
  const shelves: TerritoryShelf[] = [];
  const dependent = new Set(dependencies.map((d) => d.from));
  const shelfLimit = dense ? G.denseShelfLimit : G.maxShelves;
  let complete = true;
  for (const s of sectors) {
    const m = markOf.get(s.t)!;
    const caps = [...s.t.caps].sort((a, b) => {
      const ea = tree.capabilityElements.get(a.id)?.length ?? 0;
      const eb = tree.capabilityElements.get(b.id)?.length ?? 0;
      return eb - ea || byLabel(a, b);
    });
    const angles: number[] = [];
    for (let k = 0; ; k++) {
      const up = s.mid + k * G.searchStep;
      const down = s.mid - k * G.searchStep;
      if (up > s.end && down < s.start) break;
      if (up <= s.end) angles.push(up);
      if (k > 0 && down >= s.start) angles.push(down);
    }
    const place = (unnamed: ReadonlySet<string>) => {
      const placedCaps: TerritoryCapability[] = [];
      const used = new Map<number, number[]>();
      for (const c of caps) {
        const elementIds = tree.capabilityElements.get(c.id) ?? [];
        const r = capabilityRadius(elementIds.length);
        // Reserve the wider focus variant ("name · N") so positions never move between states.
        const reserve = elementIds.length > 0 ? `${c.label} · ${elementIds.length}` : c.label;
        const w = measure(reserve, "capability");
        const stand = (k: number, a: number, p: { x: number; y: number }, label: TerritoryLabel, labelReserved: boolean) => {
          const list = used.get(k);
          if (list) list.push(a);
          else used.set(k, [a]);
          return {
            id: c.id, name: c.label, domainId: s.t.domain ? s.t.id : null, x: p.x, y: p.y, r, angle: a, shelf: k,
            elementIds, hasDependency: dependent.has(c.id), label, labelReserved,
          };
        };
        let placed: TerritoryCapability | null = null;
        for (let k = 0; k < shelfLimit && !placed && !unnamed.has(c.id); k++) {
          const radius = shelfRadius + k * shelfStep;
          for (const a of angles) {
            const p = onArc(m.x, m.y, radius, a);
            const disc = { x: p.x - r - 3, y: p.y - r - 3, w: 2 * r + 6, h: 2 * r + 6 };
            if (grid.hits(disc)) continue;
            const label = capabilityLabelAt(p.x, p.y, r, a, c.label, w);
            if (!dense && grid.hits(label.box)) continue;
            grid.add(c.id, "mark", disc);
            if (!dense) grid.add(c.id, "label", label.box);
            placed = stand(k, a, p, label, !dense);
            break;
          }
        }
        if (!placed && names !== "keepEvery" && !dense) {
          // Stand the disc anyway and let the name wait for hover, rather than draw it under the chrome.
          for (let k = 0; k < G.foldedShelfLimit && !placed; k++) {
            const radius = shelfRadius + k * shelfStep;
            for (const a of angles) {
              const p = onArc(m.x, m.y, radius, a);
              const disc = { x: p.x - r - 3, y: p.y - r - 3, w: 2 * r + 6, h: 2 * r + 6 };
              if (grid.hits(disc)) continue;
              grid.add(c.id, "mark", disc);
              placed = stand(k, a, p, capabilityLabelAt(p.x, p.y, r, a, c.label, w), false);
              break;
            }
          }
        }
        if (!placed) return { placedCaps, used, complete: false };
        placedCaps.push(placed);
      }
      return { placedCaps, used, complete: true };
    };
    const before = grid.all.length;
    let result = place(new Set());
    if (!result.complete && names === "yieldToDiscs" && !dense) {
      // Bisects the tail whose names must fold: O(log n) placements.
      const retry = (n: number) => {
        grid.popTo(before);
        return place(new Set(caps.slice(caps.length - n).map((c) => c.id)));
      };
      let [lo, hi] = [0, caps.length];
      if (retry(hi).complete) {
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (retry(mid).complete) hi = mid;
          else lo = mid;
        }
      }
      result = retry(hi);
    }
    for (const c of result.placedCaps) {
      capabilities.push(c);
      if (s.t.domain) domainById.get(s.t.id)!.capabilityIds.push(c.id);
    }
    if (!result.complete) {
      complete = false;
      break;
    }
    if (s.t.domain) {
      for (const [k, list] of [...result.used.entries()].sort((x, y) => x[0] - y[0])) {
        shelves.push({
          domainId: s.t.id,
          cx: m.x,
          cy: m.y,
          radius: shelfRadius + k * shelfStep,
          from: Math.min(...list) - 5 * DEG,
          to: Math.max(...list) + 5 * DEG,
        });
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (b: Box) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  };
  for (const { box } of grid.all) extend(box);
  // A folded name is drawn only on hover, so it does not widen the resting drawing.
  for (const c of capabilities) if (c.labelReserved || dense) extend(c.label.box);
  const bounds = Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 0, h: 0 };

  return {
    complete,
    layout: {
      project,
      domains,
      capabilities,
      shelves,
      elementParent: tree.elementParent,
      dependencies: [...dependencies],
      rollups,
      dense,
      fitsRoom: room !== null && complete,
      boxes: grid.all,
      bounds,
    },
  };
}

export function computeTerritoryLayout(
  nodes: readonly TerritoryInputNode[],
  edges: readonly TerritoryInputEdge[],
  options: TerritoryLayoutOptions,
): TerritoryLayout {
  const tree = readTree(nodes, edges);
  const dependencies = rollDependencies(tree, edges);
  const forcedDense = tree.domains.length > TERRITORY_GEOMETRY.denseDomainCount;
  if (!forcedDense) {
    // Inside the room with every name, then names folded, then yielding to discs, then unbounded
    // (the camera pans), then dense. Every name at any spacing beats some names folded.
    if (options.room) {
      for (const names of ["keepEvery", "foldWithoutPlace", "yieldToDiscs"] as const) {
        for (const spread of TERRITORY_GEOMETRY.roomSpreads) {
          const inRoom = attempt(tree, dependencies, options, options.room, false, names, spread);
          if (inRoom.complete) return inRoom.layout;
        }
      }
    }
    const open = attempt(tree, dependencies, options, null, false);
    if (open.complete) return open.layout;
  }
  return attempt(tree, dependencies, options, null, true).layout;
}

export interface TerritorySatellite {
  id: string;
  x: number;
  y: number;
}

export interface TerritoryCluster {
  side: 1 | -1;
  satellites: TerritorySatellite[];
  /** The box a reader has to see past. */
  plate: Box;
}

function clusterPlate(sats: readonly TerritorySatellite[], side: 1 | -1, widest: number): Box {
  const x = sats[0]!.x;
  const near = x - side * 15;
  const far = x + side * (9 + widest + 10);
  const top = sats[0]!.y;
  const bottom = sats[sats.length - 1]!.y;
  return { x: Math.min(near, far), y: top - 12, w: Math.abs(far - near), h: bottom - top + 24 };
}

/**
 * A column beside the disc, one row apart, starting opposite its own name. When the plate
 * would cover an `avoid` box (its domain's title and counts) it slides along the side, then
 * tries the other side. Deterministic, so hit test and paint agree.
 */
export function placeTerritoryCluster(
  capability: TerritoryCapability,
  widest = 0,
  avoid: readonly Box[] = [],
): TerritoryCluster {
  const G = TERRITORY_GEOMETRY;
  const n = capability.elementIds.length;
  const home: 1 | -1 =
    capability.label.align === "right" ? 1 : capability.label.align === "left" ? -1 : Math.cos(capability.angle) >= 0 ? 1 : -1;
  const at = (side: 1 | -1, shift: number) => {
    const x = capability.x + side * (capability.r + G.satelliteGap + 16);
    return capability.elementIds.map((id, i) => ({ id, x, y: capability.y + shift + (i - (n - 1) / 2) * G.satelliteRow }));
  };
  const first = { side: home, satellites: at(home, 0) };
  if (n === 0) return { ...first, plate: { x: capability.x, y: capability.y, w: 0, h: 0 } };
  const clear = (plate: Box) => !avoid.some((b) => boxesOverlap(plate, b));
  // One end of the list stays level with the disc, so the spine still reaches it.
  const reach = ((n - 1) / 2) * G.satelliteRow + G.satelliteRow;
  const besideDisc = [0];
  for (let d = G.satelliteRow; d <= reach; d += G.satelliteRow) besideDisc.push(-d, d);
  const clearOfTallestBox = reach + (n - 1) * G.satelliteRow + 24 + Math.max(0, ...avoid.map((b) => b.h));
  const spineRunsOn: number[] = [];
  for (let d = reach + G.satelliteRow; d <= clearOfTallestBox; d += G.satelliteRow) spineRunsOn.push(-d, d);
  for (const shifts of [besideDisc, spineRunsOn]) {
    for (const side of [home, (home === 1 ? -1 : 1) as 1 | -1]) {
      for (const shift of shifts) {
        const satellites = at(side, shift);
        const plate = clusterPlate(satellites, side, widest);
        if (clear(plate)) return { side, satellites, plate };
      }
    }
  }
  return { ...first, plate: clusterPlate(first.satellites, home, widest) };
}

/** Drawn only while the capability or one of its elements is selected. */
export function territorySatellites(
  capability: TerritoryCapability,
  widest = 0,
  avoid: readonly Box[] = [],
): TerritorySatellite[] {
  return placeTerritoryCluster(capability, widest, avoid).satellites;
}

export function territoryClusterAvoid(layout: TerritoryLayout, capability: TerritoryCapability): Box[] {
  const out: Box[] = [capability.label.box];
  const domain = layout.domains.find((d) => d.id === capability.domainId);
  if (domain) out.push(domain.label.box, domain.stats.box);
  return out;
}
