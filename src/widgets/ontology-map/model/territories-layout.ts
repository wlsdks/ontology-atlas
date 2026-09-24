/**
 * **Territories** — the flat map with nothing folded (owner decision, 2026-09-24; geometry per
 * the owner's refined concept spec "A v2").
 *
 * The containment map answers "what is inside what" one expansion at a time. At the scale of a
 * real vault (a project, a handful of domains, tens of capabilities) that question is small
 * enough to answer all at once, and the expansion step is what hides it. Territories draws every
 * capability, named, in its own domain's territory, so "which domain does this belong to" is
 * read from position rather than from a click.
 *
 * The rules this module owns:
 *
 * - **Most-specific parent.** An element listed under a capability belongs to that capability,
 *   not also to the domain that lists it. Elements are not drawn in the overview; a capability's
 *   disc grows with its element count and its elements appear as satellites when selected.
 * - **Territory, not hull.** Each domain owns an angular sector (weighted by its capability
 *   count, an empty gap between neighbours). Its mark sits on a ring around the project, and its
 *   capabilities are packed on open *shelves* — squashed arcs centred on the mark — biggest
 *   nearest the mark. Nothing encloses a territory.
 * - **No overlap by construction.** Every disc, every name, every title and every count pill is
 *   a box, and a box is only accepted where it touches no box already placed (plus a clearance).
 *   Placement is greedy and total-ordered: the same vault always draws the same picture.
 * - **Rolled-up dependencies.** Capability → capability dependencies, with element ends rolled
 *   up to their owning capability, are counted per ordered domain pair and drawn as one stroke
 *   with a count pill between the two marks, pulled toward the project.
 * - **Dense mode.** When a territory would need more than `maxShelves` shelves, or there are
 *   more than `denseDomainCount` domains, the overview places discs only; names are drawn on
 *   hover and in focus. Every capability is still placed, and nothing overlaps.
 *
 * Coordinates are CSS pixels at a fixed label scale, origin at the project's centre. The view
 * never zooms: labels keep one size and the camera only pans.
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
  /** `contains` is containment (parent → child, or child → parent for `belongs_to`). */
  kind: "contains" | "depends";
  relationType: string;
}

/** Which text a width is asked for, so the renderer can answer with its real fonts. */
export type TerritoryTextRole = "project" | "domain" | "domainStats" | "capability" | "element" | "chip";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TerritoryLayoutOptions {
  /** Width in CSS px of `text` drawn in the font for `role`. */
  measure: (text: string, role: TerritoryTextRole) => number;
  /**
   * The counts line under a domain's name ("7 capabilities · 16 elements · 1 stale"). The page composes it;
   * layout only needs its width.
   */
  domainStats: (domain: {
    id: string;
    capabilityIds: readonly string[];
    capabilityCount: number;
    elementCount: number;
  }) => string;
  /**
   * The room the drawing should fit, relative to the project centre. When given, every placed
   * box must lie inside it; if the vault does not fit, the layout is recomputed without it
   * (the camera pans) rather than dropping anything.
   */
  room?: Box | null;
}

export interface TerritoryLabel {
  text: string;
  /** Where the text is drawn: `x` per `align`, `y` the alphabetic baseline. */
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
  /** Half the side of the rounded-square mark. */
  half: number;
  /** Centre and edges of this domain's sector, radians, screen convention (y down). */
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
  /** The shelf angle it was placed at (radians, about its domain mark). */
  angle: number;
  /** Which shelf, counted from the mark. */
  shelf: number;
  elementIds: string[];
  /** Whether it depends on anything — drawn as a dot in the disc. */
  hasDependency: boolean;
  /** Its name. In dense mode it is placed but not reserved (drawn on hover and in focus only). */
  label: TerritoryLabel;
  /** Whether `label` was reserved (no overlap guaranteed). False only in dense mode. */
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

interface TerritoryDependency {
  /** Capability the dependency starts from (an element's dependency is rolled up to it). */
  from: string;
  /** Capability the dependency lands on (an element target is rolled up to its capability). */
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
  /** element id → the capability (or, when no capability lists it, the domain) that owns it. */
  elementParent: Map<string, string>;
  dependencies: TerritoryDependency[];
  rollups: TerritoryRollup[];
  /** Discs only at overview: names wait for hover and focus. */
  dense: boolean;
  /** Whether the drawing fits the room it was asked to fit (always false without a room). */
  fitsRoom: boolean;
  /** Every reserved box — the set the no-overlap rule was checked against. */
  boxes: { id: string; role: "mark" | "label" | "chip"; box: Box }[];
  bounds: Box;
}

const DEG = Math.PI / 180;

/**
 * Layout constants (spec "A v2", tuned on 1512×949). One place, because every rule above must
 * survive a change here; the unit tests check the rules, not these numbers.
 */
export const TERRITORY_GEOMETRY = {
  projectRadius: 30,
  /** Hub → domain mark. */
  domainRing: 190,
  /** Vertical squash of every arc: screens are wider than tall. */
  squash: 0.86,
  /** First shelf radius from the domain mark, and the step between shelves. */
  shelfRadius: 138,
  shelfStep: 78,
  /** Empty angle between neighbouring territories. */
  sectorGap: 20 * DEG,
  /** Angular search step along a shelf. */
  searchStep: 0.75 * DEG,
  /** Clearance between any two placed boxes. */
  pad: 4,
  domainHalf: 20,
  maxShelves: 7,
  denseDomainCount: 10,
  /** Upper bound on shelves in dense mode — a safety bound, never reached in practice. */
  denseShelfLimit: 400,
  capabilityFontPx: 11,
  domainFontPx: 15,
  domainStatsFontPx: 10,
  projectFontPx: 15,
  chipFontPx: 10,
  chipHeight: 18,
  chipMinWidth: 26,
  /** Rollups: how far the control point is pulled toward the hub, the sideways bow for a chord
   * through the hub, and the extra offset that keeps A→B and B→A apart. */
  rollupPull: 0.55,
  rollupHubRadius: 60,
  rollupBow: 150,
  rollupPairGap: 22,
  satelliteGap: 14,
  satelliteRow: 16,
} as const;

/** Disc radius: size = element count. */
function capabilityRadius(elementCount: number): number {
  return 7 + 1.7 * elementCount;
}

/* ── collision grid ─────────────────────────────────────────────────────── */

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

/* ── graph reading ──────────────────────────────────────────────────────── */

interface Tree {
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

function readTree(nodes: readonly TerritoryInputNode[], edges: readonly TerritoryInputEdge[]): Tree {
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind] as const));
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "contains") continue;
    if (!kindOf.has(e.source) || !kindOf.has(e.target)) continue;
    // `belongs_to` states the same containment from the child's side.
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

  // Most-specific parent: a capability that lists the element wins over a domain that also does.
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

function rollDependencies(tree: Tree, edges: readonly TerritoryInputEdge[]): TerritoryDependency[] {
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

/* ── placement ──────────────────────────────────────────────────────────── */

/** Point on a squashed circle. */
function onArc(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * TERRITORY_GEOMETRY.squash * Math.sin(angle) };
}

/** One rule for a capability's name: always on the outside of its shelf, on its own radial. */
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

function attempt(
  tree: Tree,
  dependencies: readonly TerritoryDependency[],
  options: TerritoryLayoutOptions,
  room: Box | null,
  dense: boolean,
): Attempt {
  const G = TERRITORY_GEOMETRY;
  const grid = new BoxGrid(room);
  const measure = options.measure;
  const denseRing = Math.max(G.domainRing, 36 * tree.domains.length);
  const ring = dense ? denseRing : G.domainRing;

  /* Project at the origin, its name under the hexagon. */
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

  /* Territories: capabilities per domain; capabilities no domain holds get a territory too. */
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
  // Largest territory first, then by name: it takes the up-right sector.
  territories.sort((a, b) => b.caps.length - a.caps.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1));

  const weights = territories.map((t) => t.caps.length + 2);
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  // Many territories share the circle: the gap never takes more than half of it.
  const gap = territories.length > 1 ? Math.min(G.sectorGap, Math.PI / territories.length) : 0;
  const avail = 2 * Math.PI - gap * territories.length;
  let cursor = -45 * DEG - (avail * weights[0]!) / wsum / 2;
  const sectors = territories.map((t, i) => {
    const span = (avail * weights[i]!) / wsum;
    const s = { t, start: cursor, end: cursor + span, mid: cursor + span / 2 };
    cursor += span + gap;
    return s;
  });

  /* Domain marks, and titles on their outward-vertical side reading outward. */
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
    // The block's box spans ty − 16 … ty + 16; it clears the mark on either side.
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

  /* Rolled-up strokes, before capabilities: their pills are obstacles. */
  const capDomain = new Map<string, string | null>();
  for (const c of tree.capabilities) capDomain.set(c.id, tree.capabilityDomain.get(c.id) ?? null);
  const counts = new Map<string, number>();
  const seenPair = new Set<string>();
  for (const dep of dependencies) {
    const a = capDomain.get(dep.from);
    const b = capDomain.get(dep.to);
    if (!a || !b || a === b || !domainById.has(a) || !domainById.has(b)) continue;
    // Distinct capability edges: two element edges between the same capabilities count once.
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
    // The pair's own perpendicular, oriented to point up, so both directions agree on it.
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
      // Near-opposite marks: the chord crosses the hub, so bow sideways, up, clear of its name.
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

  /* Capabilities: shelf by shelf, from the sector's centre line outward, alternating sides. */
  const capabilities: TerritoryCapability[] = [];
  const shelves: TerritoryShelf[] = [];
  const dependent = new Set(dependencies.map((d) => d.from));
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
    const used = new Map<number, number[]>();
    const shelfLimit = dense ? G.denseShelfLimit : G.maxShelves;
    for (const c of caps) {
      const elementIds = tree.capabilityElements.get(c.id) ?? [];
      const r = capabilityRadius(elementIds.length);
      // Reserve the wider focus-state variant ("name · N") so positions never move between states.
      const reserve = elementIds.length > 0 ? `${c.label} · ${elementIds.length}` : c.label;
      const w = measure(reserve, "capability");
      let placed: TerritoryCapability | null = null;
      for (let k = 0; k < shelfLimit && !placed; k++) {
        const radius = G.shelfRadius + k * G.shelfStep;
        for (const a of angles) {
          const p = onArc(m.x, m.y, radius, a);
          const disc = { x: p.x - r - 3, y: p.y - r - 3, w: 2 * r + 6, h: 2 * r + 6 };
          if (grid.hits(disc)) continue;
          const label = capabilityLabelAt(p.x, p.y, r, a, c.label, w);
          if (!dense && grid.hits(label.box)) continue;
          grid.add(c.id, "mark", disc);
          if (!dense) grid.add(c.id, "label", label.box);
          placed = {
            id: c.id,
            name: c.label,
            domainId: s.t.domain ? s.t.id : null,
            x: p.x,
            y: p.y,
            r,
            angle: a,
            shelf: k,
            elementIds,
            hasDependency: dependent.has(c.id),
            label,
            labelReserved: !dense,
          };
          const list = used.get(k);
          if (list) list.push(a);
          else used.set(k, [a]);
          break;
        }
      }
      if (!placed) {
        complete = false;
        break;
      }
      capabilities.push(placed);
      if (s.t.domain) domainById.get(s.t.id)!.capabilityIds.push(c.id);
    }
    if (!complete) break;
    if (s.t.domain) {
      for (const [k, list] of [...used.entries()].sort((x, y) => x[0] - y[0])) {
        shelves.push({
          domainId: s.t.id,
          cx: m.x,
          cy: m.y,
          radius: G.shelfRadius + k * G.shelfStep,
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
  for (const c of capabilities) extend(c.label.box);
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
    // Inside the room first; then unbounded (the camera pans); then dense.
    if (options.room) {
      const inRoom = attempt(tree, dependencies, options, options.room, false);
      if (inRoom.complete) return inRoom.layout;
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

/**
 * Where a selected capability's elements sit: a fan on the outward side of its disc, centred on
 * its shelf angle. Drawn only while the capability (or one of its elements) is selected.
 */
export function territorySatellites(capability: TerritoryCapability): TerritorySatellite[] {
  const G = TERRITORY_GEOMETRY;
  const n = capability.elementIds.length;
  // A column beside the disc, one name row apart, so the names read as a list and never
  // stack on each other however many there are.
  // Opposite the capability's own name, so the list never covers the name it belongs to.
  const side = capability.label.align === "right" ? 1 : capability.label.align === "left" ? -1 : Math.cos(capability.angle) >= 0 ? 1 : -1;
  const x = capability.x + side * (capability.r + G.satelliteGap + 16);
  return capability.elementIds.map((id, i) => ({ id, x, y: capability.y + (i - (n - 1) / 2) * G.satelliteRow }));
}
