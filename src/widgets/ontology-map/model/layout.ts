/**
 * Deterministic concentric-ring layout (prototype `docs/prototypes/topology-b2plus.html` §4;
 * `docs/design/ontology-map.md` §4 P2): the project at the origin, domains on
 * `--map-layout-ring-domain`, capabilities fanned on `--map-layout-ring-capability` round
 * their domain, elements on `--map-layout-ring-element` round their capability. The same
 * radius on both axes at every ring (no aspect stretch). Positions never depend on the
 * camera. Seeding is O(N); the collision relax is O(N × iterations) on a spatial grid.
 */

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ExpandStructure } from "@/shared/lib/appearance-preferences";
import { DENSITY_GATE_THRESHOLD } from "./density-gate";
import { rankEgoNeighborsByDOI } from "./focus-state";

export type LayoutNodeKind = "project" | "domain" | "capability" | "element";

export interface LayoutGraphNode {
  id: string;
  kind: LayoutNodeKind;
  parentId: string | null;
}

export interface LayoutRings {
  domain: number;
  capability: number;
  element: number;
}

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
}

/** Defaults mirror the §2.3 node radius tokens. */
export interface LayoutRadii {
  project: number;
  domain: number;
  capability: number;
  element: number;
}

export interface LayoutOptions {
  radii?: LayoutRadii;
  /** Fixed, so the same input gives identical output. Default 60. */
  relaxIterations?: number;
  /** Gap beyond the two radii before a pair collides. Default 6. */
  relaxPadding?: number;
  /**
   * `"grid"` (default) buckets by spatial hash; `"bruteforce"` is the all-pairs reference
   * oracle. Both are byte-identical (`layout.test.ts`); only tests set this.
   */
  relaxStrategy?: "grid" | "bruteforce";
  /**
   * Relax only these nodes; the rest stay at their seeds as obstacles. Relaxation dominates
   * the cost and most nodes are folded and never drawn, so scoping it to what will be drawn
   * removes the freeze on large vaults. Seeds are still computed for everything, so a tier
   * opening or a chip expanding finds coordinates ready.
   */
  relaxScope?: ReadonlySet<string>;
  /**
   * How an over-threshold parent's children are placed; omitted is `"disc"`. Parents at or
   * below the threshold take the fan path byte-identically whatever this says.
   */
  expandStructure?: ExpandStructure;
}

const DEFAULT_RADII: LayoutRadii = { project: 25, domain: 17, capability: 11, element: 7 };
const DEFAULT_RELAX_ITERATIONS = 60;
const DEFAULT_RELAX_PADDING = 6;

/**
 * At or below this count a fan keeps the base ring and spread, so small vaults land exactly
 * on the ring token; above it the ring and arc grow with the count so a dense fan starts
 * spread before the relax runs.
 */
const CAP_DENSITY_THRESHOLD = 4;
const ELEMENT_DENSITY_THRESHOLD = 4;
/** Wide enough that wide fans do not wrap onto themselves. */
const CAP_SPREAD_MAX = 1.5;
const ELEMENT_SPREAD_MAX = 1.6;

/**
 * Above this a parent's children go on a bounded phyllotaxis disc instead of a fan whose
 * radius grows with n. Shared with `density-gate.ts`: the parents that fold and the parents
 * placed on a disc must be the same set.
 */
const PHYLLOTAXIS_THRESHOLD = DENSITY_GATE_THRESHOLD;
/**
 * In a Vogel spiral `r = spacing·√i` the nearest-neighbour distance ≈ spacing, so 26 covers
 * the element diameter (14) plus clearance; at n=108 the disc radius is about 414.
 */
const PHYLLOTAXIS_SPACING = 26;

const TAU = Math.PI * 2;

interface PlacedPoint {
  x: number;
  y: number;
  /** Only domains and capabilities need it, to seed their children's fan. */
  angle: number;
}

export function computeConcentricLayout(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  options: LayoutOptions = {},
): LayoutPoint[] {
  const placed = new Map<string, PlacedPoint>();
  const expandStructure = options.expandStructure ?? DEFAULT_EXPAND.structure;

  // Containment child count is the only hub signal layout has, so the disc orders children
  // by it: the highest-DOI hub lands at i=0, nearest the centre.
  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentId !== null) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  }
  /**
   * Stable DOI sort before the phyllotaxis disc, so the hub sits at the centre and leaves at
   * the rim; the fan path never takes it.
   */
  const rankDiscChildren = (children: readonly LayoutGraphNode[]): LayoutGraphNode[] => {
    const byId = new Map(children.map((c) => [c.id, c]));
    return rankEgoNeighborsByDOI(
      children.map((c) => ({ id: c.id, kind: c.kind, degree: childCount.get(c.id) ?? 0 })),
    ).map((id) => byId.get(id) as LayoutGraphNode);
  };

  const project = nodes.find((n) => n.kind === "project");
  if (project) {
    placed.set(project.id, { x: 0, y: 0, angle: 0 });
  }

  const domainNodes = nodes.filter((n) => n.kind === "domain");
  domainNodes.forEach((domain, i) => {
    const angle = (i / domainNodes.length) * TAU - Math.PI / 2;
    placed.set(domain.id, {
      x: Math.cos(angle) * rings.domain,
      y: Math.sin(angle) * rings.domain,
      angle,
    });
  });

  domainNodes.forEach((domain) => {
    const domainPoint = placed.get(domain.id);
    if (!domainPoint) return;
    const caps = nodes.filter((n) => n.kind === "capability" && n.parentId === domain.id);
    // Elements directly under a domain join the capability fan as one arc; left out they stack
    // at (0,0) and physics drags the stack into a blob.
    const directElements = nodes.filter((n) => n.kind === "element" && n.parentId === domain.id);
    const fan = [...caps, ...directElements];
    if (fan.length > PHYLLOTAXIS_THRESHOLD) {
      placeExpandedChildren(domainPoint, rankDiscChildren(fan), rings.capability, placed, expandStructure);
      return;
    }
    // A dense fan starts spread; small fans keep the exact base ring (`layout.test.ts`).
    const capR = rings.capability * Math.max(1, fan.length / CAP_DENSITY_THRESHOLD);
    const elR = rings.element * Math.max(1, fan.length / ELEMENT_DENSITY_THRESHOLD);
    const spread = Math.min(CAP_SPREAD_MAX, 0.32 + fan.length * 0.22);
    fan.forEach((child, i) => {
      const t = fan.length === 1 ? 0 : i / (fan.length - 1) - 0.5;
      const angle = domainPoint.angle + t * spread;
      const r = child.kind === "capability" ? capR : elR;
      placed.set(child.id, {
        x: domainPoint.x + Math.cos(angle) * r,
        y: domainPoint.y + Math.sin(angle) * r,
        angle,
      });
    });
  });

  const capabilityNodes = nodes.filter((n) => n.kind === "capability");
  capabilityNodes.forEach((cap) => {
    const capPoint = placed.get(cap.id);
    if (!capPoint) return;
    const elements = nodes.filter((n) => n.kind === "element" && n.parentId === cap.id);
    if (!elements.length) return;
    if (elements.length > PHYLLOTAXIS_THRESHOLD) {
      placeExpandedChildren(capPoint, rankDiscChildren(elements), rings.element, placed, expandStructure);
      return;
    }
    const elR = rings.element * Math.max(1, elements.length / ELEMENT_DENSITY_THRESHOLD);
    const spread = Math.min(ELEMENT_SPREAD_MAX, 0.26 + elements.length * 0.26);
    elements.forEach((element, i) => {
      const t = elements.length === 1 ? 0 : i / (elements.length - 1) - 0.5;
      const angle = capPoint.angle + t * spread;
      placed.set(element.id, {
        x: capPoint.x + Math.cos(angle) * elR,
        y: capPoint.y + Math.sin(angle) * elR,
        angle,
      });
    });
  });

  placeRemainingByParentChain(nodes, rings, placed, rankDiscChildren, expandStructure);
  placeOrphans(nodes, rings, placed);

  relaxCollisions(nodes, placed, options);

  return nodes.map((n) => {
    const point = placed.get(n.id);
    return { id: n.id, x: point?.x ?? 0, y: point?.y ?? 0 };
  });
}

/**
 * Lineages the standard fan does not cover (element ⊃ element, elements under a project,
 * capability ⊃ capability) fan out from their placed parent; a no-op on a standard vault.
 */
function placeRemainingByParentChain(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  placed: Map<string, PlacedPoint>,
  rankDiscChildren: (children: readonly LayoutGraphNode[]) => LayoutGraphNode[],
  expandStructure: ExpandStructure,
): void {
  // Repeat while progress is made so deep chains converge deterministically.
  for (let pass = 0; pass < nodes.length; pass += 1) {
    const pending = nodes.filter((n) => !placed.has(n.id) && n.parentId !== null && placed.has(n.parentId));
    if (pending.length === 0) return;
    const byParent = new Map<string, LayoutGraphNode[]>();
    for (const n of pending) {
      const list = byParent.get(n.parentId as string) ?? [];
      list.push(n);
      byParent.set(n.parentId as string, list);
    }
    for (const [parentId, kids] of byParent) {
      const parentPoint = placed.get(parentId);
      if (!parentPoint) continue;
      if (kids.length > PHYLLOTAXIS_THRESHOLD) {
        placeExpandedChildren(parentPoint, rankDiscChildren(kids), rings.element, placed, expandStructure);
        continue;
      }
      const r = rings.element * Math.max(1, kids.length / ELEMENT_DENSITY_THRESHOLD);
      const spread = Math.min(ELEMENT_SPREAD_MAX, 0.26 + kids.length * 0.26);
      kids.forEach((kid, i) => {
        const t = kids.length === 1 ? 0 : i / (kids.length - 1) - 0.5;
        const angle = parentPoint.angle + t * spread;
        placed.set(kid.id, {
          x: parentPoint.x + Math.cos(angle) * r,
          y: parentPoint.y + Math.sin(angle) * r,
          angle,
        });
      });
    }
  }
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The disc centre is pushed `ringRadius` outward, away from the grandparent, and child i
 * sits at `r = spacing·√(i+0.5)`, so the footprint stays bounded.
 */
function placePhyllotaxisDisk(
  parent: PlacedPoint,
  children: readonly LayoutGraphNode[],
  ringRadius: number,
  placed: Map<string, PlacedPoint>,
): void {
  const cx = parent.x + Math.cos(parent.angle) * ringRadius;
  const cy = parent.y + Math.sin(parent.angle) * ringRadius;
  children.forEach((child, i) => {
    const a = i * GOLDEN_ANGLE;
    const r = PHYLLOTAXIS_SPACING * Math.sqrt(i + 0.5);
    placed.set(child.id, {
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      angle: parent.angle,
    });
  });
}

/*
 * The three expand structures carry the mockup's geometry only: this module cannot measure
 * text, so labels stay with the greedy placer (`render/label-layout.ts`). All are
 * deterministic and leave residual overlap to `relaxCollisions`.
 */

/**
 * An outward arc that starts a further row when one fills; its radius grows linearly, so
 * rows can reach sibling domains. Bounded to ±`FAN_SPREAD/2` round the outward direction.
 */
const FAN_SPREAD = Math.PI * 0.62;

/**
 * Under `magnitudeScale` a capability grows to 15.4, so two side by side need 30.8, and
 * `relaxCollisions` pushes by base radius only and cannot recover the excess.
 */
const FAN_ARC_SPACING = 34;
/** The same value for the same reason: rows also stand side by side. */
const FAN_ROW_GAP = 34;

/** Fixed spacing, centred, so a short last row stays beside the centre line. */
function placeExpandedFan(
  parent: PlacedPoint,
  children: readonly LayoutGraphNode[],
  ringRadius: number,
  placed: Map<string, PlacedPoint>,
): void {
  let index = 0;
  let row = 0;
  while (index < children.length) {
    const r = ringRadius + row * FAN_ROW_GAP;
    const step = FAN_ARC_SPACING / r;
    // At least one, or the loop never terminates.
    const capacity = Math.max(1, Math.floor(FAN_SPREAD / step) + 1);
    const take = Math.min(capacity, children.length - index);
    for (let k = 0; k < take; k += 1) {
      const angle = parent.angle + (k - (take - 1) / 2) * step;
      placed.set(children[index + k].id, {
        x: parent.x + Math.cos(angle) * r,
        y: parent.y + Math.sin(angle) * r,
        angle,
      });
    }
    index += take;
    row += 1;
  }
}

/**
 * Surrounds the parent: fits the same count in less area, but where it came from reads
 * more weakly. Each ring starts opposite the outward direction.
 */
function placeExpandedRing(
  parent: PlacedPoint,
  children: readonly LayoutGraphNode[],
  ringRadius: number,
  placed: Map<string, PlacedPoint>,
): void {
  let index = 0;
  let r = ringRadius;
  while (index < children.length) {
    const capacity = Math.max(1, Math.floor((TAU * r) / PHYLLOTAXIS_SPACING));
    const take = Math.min(capacity, children.length - index);
    for (let k = 0; k < take; k += 1) {
      const angle = parent.angle + Math.PI + (k / take) * TAU;
      placed.set(children[index + k].id, {
        x: parent.x + Math.cos(angle) * r,
        y: parent.y + Math.sin(angle) * r,
        angle,
      });
    }
    index += take;
    r += PHYLLOTAXIS_SPACING;
  }
}

/**
 * Columns advance outward, each perpendicular to it: easiest to read and least overlap, at
 * the cost of length running off screen.
 */
const COLUMN_LENGTH = 6;
const COLUMN_GAP = FAN_ARC_SPACING * 1.6;
/** 34, not 26, for the same reason as the fan. */
const COLUMN_ROW_GAP = FAN_ARC_SPACING;

function placeExpandedColumns(
  parent: PlacedPoint,
  children: readonly LayoutGraphNode[],
  ringRadius: number,
  placed: Map<string, PlacedPoint>,
): void {
  const dirX = Math.cos(parent.angle);
  const dirY = Math.sin(parent.angle);
  const perpX = -dirY;
  const perpY = dirX;
  children.forEach((child, i) => {
    const column = Math.floor(i / COLUMN_LENGTH);
    const row = i % COLUMN_LENGTH;
    const along = ringRadius + column * COLUMN_GAP;
    const across = (row - (COLUMN_LENGTH - 1) / 2) * COLUMN_ROW_GAP;
    placed.set(child.id, {
      x: parent.x + dirX * along + perpX * across,
      y: parent.y + dirY * along + perpY * across,
      angle: parent.angle,
    });
  });
}

/** `disc` is the default, so a screen that never touched the setting keeps its coordinates. */
function placeExpandedChildren(
  parent: PlacedPoint,
  children: readonly LayoutGraphNode[],
  ringRadius: number,
  placed: Map<string, PlacedPoint>,
  structure: ExpandStructure,
): void {
  if (structure === "fan") return placeExpandedFan(parent, children, ringRadius, placed);
  if (structure === "ring") return placeExpandedRing(parent, children, ringRadius, placed);
  if (structure === "column") return placeExpandedColumns(parent, children, ringRadius, placed);
  placePhyllotaxisDisk(parent, children, ringRadius, placed);
}

/** Orphans whose parent is never placed go on a golden-angle spiral beyond the domain ring. */
function placeOrphans(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  placed: Map<string, PlacedPoint>,
): void {
  const orphans = nodes.filter((n) => !placed.has(n.id));
  if (orphans.length === 0) return;
  const baseR = rings.domain + rings.capability;
  orphans.forEach((orphan, i) => {
    const angle = i * GOLDEN_ANGLE;
    const r = baseR + rings.element * 0.35 * Math.sqrt(i);
    placed.set(orphan.id, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      angle,
    });
  });
}

/** No `Math.random`, so the layout stays deterministic. */
function coincidentSeparation(id: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const angle = ((Math.abs(hash) % 1000) / 1000) * TAU;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * A one-shot deterministic de-pileup, not a live force tick: fixed iterations, fixed order
 * and an id-hashed tie-break. Only actual overlaps move, symmetrically along their axis,
 * and the project stays pinned.
 */
/** Both point shapes satisfy it, so the initial and incremental relax share one code path. */
interface MutablePoint {
  x: number;
  y: number;
}

interface RelaxItem {
  id: string;
  kind: LayoutNodeKind;
  point: MutablePoint;
  pinned: boolean;
}

/**
 * Shared by the grid and brute-force paths so byte-identity cannot drift. A pair already
 * ≥ `minDist` apart is a no-op, which lets the grid pass a superset of candidates.
 */
function resolveCollisionPair(
  a: RelaxItem,
  b: RelaxItem,
  radii: LayoutRadii,
  padding: number,
): void {
  const minDist = radii[a.kind] + radii[b.kind] + padding;
  let dx = b.point.x - a.point.x;
  let dy = b.point.y - a.point.y;
  // Conservative squared fast-reject (`+ 1` swamps float rounding): every pair that could
  // collide still reaches the exact `hypot` guard, so push decisions never change.
  const d2 = dx * dx + dy * dy;
  const minDistPlus = minDist + 1;
  if (d2 >= minDistPlus * minDistPlus) return;
  let dist = Math.hypot(dx, dy);
  if (dist >= minDist) return;
  if (dist === 0) {
    const dir = coincidentSeparation(`${a.id}|${b.id}`);
    dx = dir.x;
    dy = dir.y;
    dist = 1;
  }
  const push = (minDist - dist) / 2;
  const nx = (dx / dist) * push;
  const ny = (dy / dist) * push;
  // Only the project is pinned; two pinned nodes cannot occur but are still handled.
  if (a.pinned && !b.pinned) {
    b.point.x += nx * 2;
    b.point.y += ny * 2;
  } else if (b.pinned && !a.pinned) {
    a.point.x -= nx * 2;
    a.point.y -= ny * 2;
  } else if (!a.pinned && !b.pinned) {
    a.point.x -= nx;
    a.point.y -= ny;
    b.point.x += nx;
    b.point.y += ny;
  }
}

function relaxCollisions(
  nodes: readonly LayoutGraphNode[],
  placed: Map<string, PlacedPoint>,
  options: LayoutOptions,
): void {
  const radii = options.radii ?? DEFAULT_RADII;
  const iterations = options.relaxIterations ?? DEFAULT_RELAX_ITERATIONS;
  const padding = options.relaxPadding ?? DEFAULT_RELAX_PADDING;
  const strategy = options.relaxStrategy ?? "grid";

  const scope = options.relaxScope;
  // Out-of-scope nodes are dropped from items, not pinned: pinned obstacles still cost grid
  // rebuilds and pair scans, and these nodes are never drawn.
  const items: RelaxItem[] = [];
  for (const n of nodes) {
    if (scope !== undefined && !scope.has(n.id)) continue;
    const point = placed.get(n.id);
    if (point === undefined) continue;
    items.push({ id: n.id, kind: n.kind, point, pinned: n.kind === "project" });
  }

  if (items.length < 2) return;

  if (strategy === "bruteforce") {
    relaxBruteForce(items, radii, padding, iterations);
    return;
  }
  relaxGrid(items, radii, padding, iterations);
}

/**
 * Reference oracle: all pairs in strict `(i, j)` order, each reading positions already
 * pushed this iteration. O(n²) per iteration.
 */
function relaxBruteForce(
  items: readonly RelaxItem[],
  radii: LayoutRadii,
  padding: number,
  iterations: number,
): void {
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        resolveCollisionPair(items[i], items[j], radii, padding);
      }
    }
  }
}

/**
 * Spatial-grid de-pileup, about O(n) per iteration instead of O(n²). Byte-identical to
 * `relaxBruteForce`: the grid is rebuilt each iteration, rows i run ascending, and partners
 * j > i from the 3×3 neighbourhood are sorted by j, reproducing brute force's order. The
 * grid only needs a superset of the pushed pairs, since each re-checks distance. Cell size
 * is twice the maximum collision distance, a movement margin.
 */
function relaxGrid(
  items: readonly RelaxItem[],
  radii: LayoutRadii,
  padding: number,
  iterations: number,
): void {
  const n = items.length;
  const maxRadius = Math.max(radii.project, radii.domain, radii.capability, radii.element);
  const maxMinDist = 2 * maxRadius + padding;
  // Max collision distance plus movement margin; the floor of 1 is defensive.
  const cellSize = Math.max(1, maxMinDist * 2);

  // One integer key `cx*STRIDE + cy` avoids string keys; cells are bounded far below STRIDE.
  // cx and cy are kept apart so neighbour keys never need decoding, which breaks for negatives.
  const CELL_STRIDE = 1 << 22;
  const cellX = new Int32Array(n);
  const cellY = new Int32Array(n);
  const grid = new Map<number, number[]>();
  const neighbors: number[] = [];

  for (let iter = 0; iter < iterations; iter += 1) {
    grid.clear();
    for (let i = 0; i < n; i += 1) {
      const cx = Math.floor(items[i].point.x / cellSize);
      const cy = Math.floor(items[i].point.y / cellSize);
      cellX[i] = cx;
      cellY[i] = cy;
      const key = cx * CELL_STRIDE + cy;
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    // Neighbourhood symmetry means the j > i test alone visits each pair once.
    for (let i = 0; i < n; i += 1) {
      const baseX = cellX[i];
      const baseY = cellY[i];
      neighbors.length = 0;
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const bucket = grid.get((baseX + dx) * CELL_STRIDE + (baseY + dy));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b += 1) {
            const j = bucket[b];
            if (j > i) neighbors.push(j);
          }
        }
      }
      if (neighbors.length === 0) continue;
      neighbors.sort((a, b) => a - b);
      const a = items[i];
      const ar = radii[a.kind];
      for (let k = 0; k < neighbors.length; k += 1) {
        const b = items[neighbors[k]];
        // The same fast-reject inline, so non-colliding candidates skip the call.
        const dx = b.point.x - a.point.x;
        const dy = b.point.y - a.point.y;
        const minDistPlus = ar + radii[b.kind] + padding + 1;
        if (dx * dx + dy * dy >= minDistPlus * minDistPlus) continue;
        resolveCollisionPair(a, b, radii, padding);
      }
    }
  }
}

/**
 * `relaxScope` is fixed when the world is built, so an expand shows its children on raw
 * seeds that can overlap other parents' fans. Relaxing everything again would move nodes
 * the person is looking at, so only newly visible nodes relax, with already-placed nodes
 * near their bbox as pinned obstacles; bounded fans keep that neighbourhood constant.
 * Mutates `points` in place.
 */
export function relaxNewlyVisible(
  points: Map<string, LayoutPoint>,
  nodes: readonly LayoutGraphNode[],
  newlyVisibleIds: ReadonlySet<string>,
  alreadyPlacedIds: ReadonlySet<string>,
  options: LayoutOptions = {},
): void {
  if (newlyVisibleIds.size === 0) return;
  const radii = options.radii ?? DEFAULT_RADII;
  const iterations = options.relaxIterations ?? DEFAULT_RELAX_ITERATIONS;
  const padding = options.relaxPadding ?? DEFAULT_RELAX_PADDING;

  // Only this neighbourhood can collide.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of newlyVisibleIds) {
    const p = points.get(id);
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return;
  // Two largest radii plus padding: nothing further can reach.
  const maxRadius = Math.max(radii.project, radii.domain, radii.capability, radii.element);
  const margin = 2 * maxRadius + padding;

  const kindById = new Map(nodes.map((n) => [n.id, n.kind]));
  const items: RelaxItem[] = [];
  for (const id of newlyVisibleIds) {
    const point = points.get(id);
    const kind = kindById.get(id);
    if (!point || !kind) continue;
    items.push({ id, kind, point, pinned: false });
  }
  for (const id of alreadyPlacedIds) {
    if (newlyVisibleIds.has(id)) continue;
    const point = points.get(id);
    const kind = kindById.get(id);
    if (!point || !kind) continue;
    if (
      point.x < minX - margin ||
      point.x > maxX + margin ||
      point.y < minY - margin ||
      point.y > maxY + margin
    ) {
      continue;
    }
    items.push({ id, kind, point, pinned: true });
  }

  if (items.length < 2) return;
  if (options.relaxStrategy === "bruteforce") {
    relaxBruteForce(items, radii, padding, iterations);
    return;
  }
  relaxGrid(items, radii, padding, iterations);
}
