/**
 * Concentric-ring layout — ported from the B2+ prototype's `layout()`
 * (`docs/prototypes/topology-b2plus.html` §4): vault graph (project ⊃ domain
 * ⊃ capability ⊃ element) → deterministic `{x, y}` world coordinates.
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2 — "layout.test.ts: 고정 vault
 * 픽스처 → 결정론적 좌표, 겹침 없음, aspectX 계열 왜곡 상수 부재" — a fixed vault
 * fixture yields deterministic coordinates, no overlap, and no aspectX-style
 * distortion constant):
 * - The project sits at the origin.
 * - Domains are placed evenly around a circle of radius
 *   `--topology-v2-layout-ring-domain` (250) centered on the project.
 * - Each domain's capabilities fan out around a circle of radius
 *   `--topology-v2-layout-ring-capability` (145) centered on that domain, at
 *   an angular spread proportional to sibling count
 *   (`spread = min(0.95, 0.32 + count*0.22)`, prototype `layout()`).
 * - Each capability's elements fan out similarly around
 *   `--topology-v2-layout-ring-element` (90), `spread = min(1.05, 0.26 + count*0.26)`.
 * - This is a **structural regression fix**: Design Guardian verdict a1
 *   flagged an earlier `aspectX`-style distortion constant that stretched x
 *   independently of y. This layout must use the same effective radius on
 *   both axes at every ring — `layout.test.ts` asserts this by checking that
 *   domain nodes sit exactly `layoutRingDomain` world-units from the origin
 *   (not some x-stretched ellipse).
 * - Positions never change with zoom/camera — only their *rendered
 *   expression* does (shape morph, label fade). This module has zero camera
 *   knowledge.
 *
 * Pure function — same input always produces the same output (the prototype
 * seeds a PRNG only for node breathe-phase offsets, which is NOT part of
 * this module's contract; phase offsets belong to `model/freshness.ts` /
 * `render/node-shapes.ts`, not layout).
 */

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ExpandStructure } from "@/shared/lib/appearance-preferences";
import { DENSITY_GATE_THRESHOLD } from "./density-gate";
import { rankEgoNeighborsByDOI } from "./focus-state";

export type LayoutNodeKind = "project" | "domain" | "capability" | "element";

export interface LayoutGraphNode {
  id: string;
  kind: LayoutNodeKind;
  /** `domain.id` for capabilities, `capability.id` for elements, `null` otherwise. */
  parentId: string | null;
}

export interface LayoutRings {
  /** `--topology-v2-layout-ring-domain` = 250 */
  domain: number;
  /** `--topology-v2-layout-ring-capability` = 145 */
  capability: number;
  /** `--topology-v2-layout-ring-element` = 90 */
  element: number;
}

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
}

/** Per-kind collision radius for the deterministic de-pileup pass. Defaults mirror the §2.3 node radius tokens. */
export interface LayoutRadii {
  project: number;
  domain: number;
  capability: number;
  element: number;
}

export interface LayoutOptions {
  /** Node radii used for the collision-relax min-distance. Defaults to the prototype's §2.3 radii. */
  radii?: LayoutRadii;
  /** Fixed collision-relax iteration count. Deterministic — same input + count → identical output. Default 60. */
  relaxIterations?: number;
  /** Extra gap (world units) added on top of the two nodes' radii before they count as colliding. Default 6. */
  relaxPadding?: number;
  /**
   * Collision de-pileup strategy. `"grid"` (default) uses spatial-hash
   * bucketing to skip the O(n²) all-pairs scan; `"bruteforce"` keeps the
   * original all-pairs double loop as the reference oracle. Both produce
   * **byte-identical** output — `layout.test.ts` pins the equivalence. Only
   * tests (and a manual escape hatch) set this; production always runs `"grid"`.
   */
  relaxStrategy?: "grid" | "bruteforce";
  /**
   * Apply collision relaxation **only to nodes in this set**. Nodes outside stay
   * pinned at their seed coordinates and act purely as obstacles (they push, they
   * are not pushed). Omitted, everything relaxes — the earlier behaviour.
   *
   * **Why it exists**: seeding (fan + phyllotaxis) is cheap and relaxation is
   * expensive — measured 2026-07-31 at N=3,000: seed 4.3ms against 2,253ms total,
   * so **relaxation is 99.8%** of it. And most of that relaxation is for nodes
   * that are **never drawn**: the density conditional collapses parents with more
   * than 12 children, hiding 95% of elements behind chips (N=3,000 → 2,806 of
   * 2,954).
   *
   * Resolving overlaps for what is not drawn produced a **13.5s freeze on a slow
   * machine** (measured under 6× CPU throttling). Narrowing the scope to "what
   * will be drawn this time" puts the same vault at 7.5ms — **284×**. At 10,000
   * nodes it is 417×, and the overlap quality is better rather than worse
   * (14 → 0 today), because congestion among invisible nodes no longer eats the
   * space visible nodes need.
   *
   * Seed coordinates are still computed for **everything** — a tier opening or a
   * chip expanding must find coordinates already there for zoom reveal to work.
   */
  relaxScope?: ReadonlySet<string>;
  /**
   * **How** an over-threshold parent's children are placed (the 「확장 → 확장
   * 구조」 — expand → expand structure — setting). Omitted means `"disc"`,
   * today's placement (golden-angle phyllotaxis spiral), so zero regression.
   *
   * Parents **at or below** the threshold take the earlier fan path
   * byte-identically regardless of this value — the "expand" this setting names
   * is exactly the set of parents the density conditional collapses.
   */
  expandStructure?: ExpandStructure;
}

const DEFAULT_RADII: LayoutRadii = { project: 25, domain: 17, capability: 11, element: 7 };
const DEFAULT_RELAX_ITERATIONS = 60;
const DEFAULT_RELAX_PADDING = 6;

/**
 * Density thresholds — the count at/below which a fan keeps the base ring
 * radius and base spread cap (so small vaults, and the tiny layout.test
 * fixture, land on EXACTLY the ring token, `layout.test.ts`'s contract). Above
 * the threshold the ring is pushed out and the arc widened, proportional to the
 * child count, so a high-child-count domain's arc has room before the
 * collision-relax even runs (Design Guardian rejected the earlier fidelity: 295
 * concepts against the prototype's 40 overflow the base arcs).
 */
const CAP_DENSITY_THRESHOLD = 4;
const ELEMENT_DENSITY_THRESHOLD = 4;
/** Base angular spread caps (radians) — raised from the prototype's tighter caps so wide fans don't wrap onto themselves. */
const CAP_SPREAD_MAX = 1.5;
const ELEMENT_SPREAD_MAX = 1.6;

/**
 * A parent with **more** children than this places them on a **phyllotaxis disc**
 * (golden-angle spiral) instead of a runaway fan whose radius grows with n
 * (n=100 → r 2250), which keeps the footprint bounded. The threshold is shared
 * with `density-gate.ts`: the parents that collapse and the parents placed on a
 * disc must be exactly the same set for "expanding a collapsed chip yields a
 * bounded disc" to hold. Parents at or below it take the existing fan path
 * **byte-identically** (`layout.test.ts` contract).
 */
const PHYLLOTAXIS_THRESHOLD = DENSITY_GATE_THRESHOLD;
/**
 * Spacing between spiral points (world units). In a Vogel spiral
 * `r = spacing·√i` the nearest-neighbour distance ≈ spacing, so 26 covers the
 * element diameter (14) plus clearance. Max disc radius = shift + spacing·√(n−0.5)
 * → at n=108, shift=145 that is ≈ 145 + 26·10.35 ≈ 414, bounded (against the
 * fan's 2250).
 */
const PHYLLOTAXIS_SPACING = 26;

/**
 * Computes world coordinates for every node in `nodes`. Exactly one node of
 * kind `"project"` is expected (placed at the origin); its `parentId` is
 * ignored. Domains must have `parentId` pointing at the project id (or any
 * shared root — this module does not validate that it's literally the
 * project, only that siblings sharing a `parentId` fan out together).
 */
const TAU = Math.PI * 2;

interface PlacedPoint {
  x: number;
  y: number;
  /** Angle from this node's own parent — only domains/capabilities need it, to seed their children's fan. */
  angle: number;
}

export function computeConcentricLayout(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  options: LayoutOptions = {},
): LayoutPoint[] {
  const placed = new Map<string, PlacedPoint>();
  const expandStructure = options.expandStructure ?? DEFAULT_EXPAND.structure;

  // Containment child count per node — the hub-degree proxy used to order the
  // disc's children by DOI. Layout does not know the full edge set, so child
  // count is the only structural hub signal available. It puts the highest-DOI
  // hub capability at i=0, nearest the centre.
  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentId !== null) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  }
  /**
   * Stable-sort children by `rankEgoNeighborsByDOI` (domain 3 > capability 2 >
   * element 1 → degree → slug) just before they go on the phyllotaxis disc.
   * Because the Vogel spiral is r=spacing·√i, i=0 is nearest the centre and gets
   * the highest-DOI hub while the rim gets low-degree leaves — a natural
   * centre-outwards reading order. The slug tiebreak keeps it deterministic
   * (byte-identical). The below-threshold fan path never takes this sort, so its
   * coordinates stay byte-identical to before.
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
    // Vaults where a domain holds elements directly (no capability in between)
    // exist. Leaving them out stacks them at (0,0), and live physics then drags
    // the stack toward the hub — the "blob" defect the owner reported in 2026-07.
    // They join the capability fan as one arc; with no direct elements the output
    // is byte-identical to before.
    const directElements = nodes.filter((n) => n.kind === "element" && n.parentId === domain.id);
    const fan = [...caps, ...directElements];
    // Density conditional: a very large fan's radius runs away, so it is placed
    // on a bounded phyllotaxis disc instead. Parents at or below the threshold
    // take the fan path below byte-identically.
    if (fan.length > PHYLLOTAXIS_THRESHOLD) {
      placeExpandedChildren(domainPoint, rankDiscChildren(fan), rings.capability, placed, expandStructure);
      return;
    }
    // High-child-count de-pileup: push the ring out and widen the arc
    // proportionally so a dense fan starts spread apart (small fans keep the
    // exact base ring — `layout.test.ts`).
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
    // Density conditional: elements also go on a phyllotaxis disc past the threshold.
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
 * Leftovers, pass 1 — lineages whose parent is placed but which the standard fan
 * (project→domain→capability→element) does not cover: element ⊃ element,
 * elements directly under a project, capability ⊃ capability. They fan out from
 * their parent. On a standard vault nothing is left, so this is a no-op and the
 * existing fixture coordinates stay byte-identical.
 */
function placeRemainingByParentChain(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  placed: Map<string, PlacedPoint>,
  rankDiscChildren: (children: readonly LayoutGraphNode[]) => LayoutGraphNode[],
  expandStructure: ExpandStructure,
): void {
  // Repeat while progress is made so deep chains converge (fixed input order → deterministic).
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
      // Density conditional: bulk children of a non-standard lineage also go on a disc.
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

/** Golden angle — the angular step of the orphan spiral (phyllotaxis, deterministic). */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Lay an over-threshold parent's children on a golden-angle phyllotaxis disc.
 * The disc centre is pushed `ringRadius` along the parent's outward direction so
 * it avoids the grandparent's side, and each child sits at
 * `r = spacing·√(i+0.5)` — √ growth instead of the fan's runaway, so the
 * footprint stays bounded. Deterministic: fixed input order → byte-identical.
 * `relaxCollisions` above finishes off any remaining overlap.
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

/* ── Three expand structures ────────────────────────────────────────────────
 *
 * The mockup reserved space **including the label** (one child's real width is
 * `max(body diameter, label width)`). This module is a pure function with no
 * canvas, so it cannot measure text — only the **geometry** is carried over, and
 * labels stay the job of the greedy label placer (`render/label-layout.ts`) and
 * its "how many labels to attempt" budget. So these are not the mockup's
 * measured widths, and that is stated rather than glossed over.
 *
 * All three are deterministic — same input order → same coordinates — and, like
 * the spiral disc, leave any residual overlap to `relaxCollisions` above.
 */

/**
 * Fan — an outward arc; when one row fills, the next starts further out. The
 * radius grows **proportionally** with the count (against the spiral's √
 * growth), so stacked rows widen and can collide with sibling domains — the
 * trade-off the mockup recorded for this option. The wedge is bounded to
 * ±`FAN_SPREAD/2` around the parent's outward direction.
 */
const FAN_SPREAD = Math.PI * 0.62;

/**
 * **Arc spacing** between two neighbouring children (world units). It started as
 * the spiral disc's 26 and was raised — measured 2026-08-02 at 1512×982 with
 * three parents expanded (48 children): the fan overlapped **26 pairs** of marks
 * while spiral and ring overlapped 0. One value caused it: a child's radius grows
 * up to 1.4× under `magnitudeScale` (capability 11 → 15.4), so two side by side
 * need 30.8 and were given 26. `relaxCollisions` pushes using the **base radius**
 * only, so it cannot recover that excess.
 */
const FAN_ARC_SPACING = 34;
/** Row spacing — the same value for the same reason (rows also stand side by side). */
const FAN_ROW_GAP = 34;

/**
 * Seat a row's children at a **fixed spacing, centred**.
 *
 * It used to stretch them across the **whole** wedge with `k/(take-1) - 0.5`.
 * For a full row that is the same answer, but the **last row** diverged: the two
 * remaining children flew to the ends of the fan and stood alone at the points
 * furthest from the parent — reading as debris rather than a fan, and the first
 * to reach a sibling domain. Fixed spacing plus centring keeps the last row
 * beside the centre line.
 */
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
    const step = FAN_ARC_SPACING / r; // radians — fixed spacing at this radius
    // How many this row holds — at least one, or the loop never terminates.
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
 * Ring — **surrounds** the parent. Using every direction fits the same count in
 * a smaller area, at the cost of "where this came from" reading more weakly
 * (the mockup's recorded trade-off). Each ring starts opposite the parent's
 * outward direction and goes all the way round.
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
 * Columns — **lined up** outwards. Labels stand side by side, so it reads most
 * easily and has almost no room to overlap; the cost is length running off
 * screen (the mockup's recorded trade-off). Columns advance along the parent's
 * outward direction, each running perpendicular to it.
 */
const COLUMN_LENGTH = 6;
const COLUMN_GAP = FAN_ARC_SPACING * 1.6;
/** Vertical spacing within a column — 34, not 26, for the same reason as the fan. */
const COLUMN_ROW_GAP = FAN_ARC_SPACING;

function placeExpandedColumns(
  parent: PlacedPoint,
  children: readonly LayoutGraphNode[],
  ringRadius: number,
  placed: Map<string, PlacedPoint>,
): void {
  const dirX = Math.cos(parent.angle);
  const dirY = Math.sin(parent.angle);
  // Columns run perpendicular to outward.
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

/**
 * Place an over-threshold parent's children — delegates to the structure the
 * setting chose. `disc` is both the default and today's placement, so a screen
 * that never touched the setting keeps byte-identical coordinates.
 */
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

/**
 * Leftovers, pass 2 — orphans whose parent never gets placed (nodes outside
 * containment) go on a golden-angle spiral beyond the domain ring. They used to
 * stack at (0,0), and live physics dragged that stack into a blob where even the
 * labels overlapped.
 */
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

/** Deterministic per-id unit direction for separating two exactly-coincident points (no `Math.random`). */
function coincidentSeparation(id: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const angle = ((Math.abs(hash) % 1000) / 1000) * TAU;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * DETERMINISTIC collision de-pileup (`docs/prototypes/topology-b2plus.html` §4
 * invariant — node positions never change on their own). This is a ONE-SHOT
 * post-process, NOT a live force tick: a fixed iteration count, a fixed node
 * order, and a seeded (id-hashed) tie-break for coincident points, so the same
 * graph always yields byte-identical coordinates (`layout.test.ts` pins this).
 *
 * It resolves only actual overlaps (pair distance < r_a + r_b + padding),
 * pushing the two nodes symmetrically apart along their connecting axis. The
 * project stays pinned at the origin. Because the concentric seed keeps domains
 * far apart, only local siblings / cross-fan boundaries move — the aligned
 * "circuit" star-chart survives, the dense fans stop piling.
 */
/**
 * The minimum shape collision resolution actually mutates — `x`/`y` only. Both
 * `PlacedPoint` (with angle) and `LayoutPoint` (with id) satisfy it, so the
 * initial placement and the incremental re-relax run the **same relaxation
 * code**; two copies would drift.
 */
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
 * Resolves a single (a, b) collision, mutating `a.point`/`b.point` in place.
 * Shared by BOTH the grid and brute-force paths so the two can never drift —
 * byte-identity depends on the push arithmetic being literally the same code.
 * Returns after a no-op when the pair is already ≥ `minDist` apart, so an
 * over-included grid candidate that isn't actually colliding costs nothing and
 * changes nothing (this is what lets the grid be a superset of the pairs the
 * brute force would push).
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
  // Conservative squared-distance fast-reject: only skips pairs whose squared
  // separation is a hair beyond `minDist²` (the `+ 1` swamps float rounding),
  // so every pair that could possibly collide still falls through to the exact
  // `Math.hypot >= minDist` guard below. This drops the sqrt on the ~99% of
  // grid candidates that sit in a different disk without ever changing a
  // push decision — output stays byte-identical to the pure-`hypot` path.
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
  // Both pinned (can't happen — only project is pinned and it's unique)
  // still handled: skip the pinned side, give the full push to the other.
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
  // Out-of-scope nodes are **dropped from items entirely**. Keeping them as
  // pinned obstacles stops them moving but leaves grid rebuild and pair
  // enumeration running, so the cost does not fall (measured: pinning alone left
  // N=3,000 at 2,081ms, unchanged). Out-of-scope nodes are never drawn in this
  // vault, so an in-scope node overlapping one has no effect on screen.
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
 * Reference oracle — the original O(n²) all-pairs de-pileup. Processes pairs
 * in strict `(i, j)` lexicographic order, each pair re-reading the current
 * (possibly already-pushed-this-iteration) positions. `relaxGrid` reproduces
 * this output byte-for-byte on realistic vaults; `layout.test.ts` pins it.
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
 * Spatial grid-hashing de-pileup — brings `relaxBruteForce`'s O(n²)×iterations
 * down to roughly O(n)×iterations (measured: n=5000 ~20s → a few hundred ms).
 *
 * Byte-identity contract: the grid is rebuilt from each iteration's starting
 * coordinates; then, walking rows `i` ascending, partners `j > i` are gathered
 * from the 3×3 cell neighbourhood, **sorted ascending by `j`**, and handed to
 * `resolveCollisionPair`. That is brute force's `for i: for j>i` lexicographic
 * order, each pair seeing the coordinates earlier rows already pushed. Every
 * pair re-checks its distance at resolution time, so the grid only has to be a
 * **superset of the pairs brute force actually pushes** — over-included
 * candidates are no-ops.
 *
 * Cell size = max collision distance (`2·maxRadius + padding`) + a movement
 * margin (the same value again, `2×` in total). The 3×3 neighbourhood catches
 * every pair whose starting Chebyshev distance is < cellSize, which comfortably
 * covers pairs that only start colliding after a node moves (roughly) the max
 * collision distance within one iteration.
 *
 * Performance: candidates go into a reused per-row scratch buffer with one short
 * local sort rather than a global pair array and global sort; integer cell keys
 * (no string allocation) and a squared-distance fast-reject cut the constant.
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
  // Cell size = max collision distance + movement margin. `maxMinDist` cannot
  // drop to 0 or below (radii and padding are ≥0, minimum 1), but the floor is
  // kept defensively.
  const cellSize = Math.max(1, maxMinDist * 2);

  // Integer cell key: fold (cx, cy) into one integer `cx*STRIDE + cy`. Cell
  // coordinates are bounded (coord/cellSize, measured in the hundreds at most)
  // so |cy| ≪ STRIDE and distinct (cx,cy) always give distinct keys — with none
  // of the GC pressure of string keys. cx/cy are kept separately so neighbour
  // keys never need decoding, which breaks for negative values.
  const CELL_STRIDE = 1 << 22;
  const cellX = new Int32Array(n);
  const cellY = new Int32Array(n);
  const grid = new Map<number, number[]>();
  const neighbors: number[] = []; // reused per-row candidate scratch

  for (let iter = 0; iter < iterations; iter += 1) {
    // 1) Rebuild the grid from this iteration's starting coordinates.
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

    // 2) Rows i ascending — gather j>i candidates from the 3×3 neighbourhood,
    //    sort by j ascending, resolve immediately. Neighbourhood symmetry means
    //    the partner>current test alone visits each pair exactly once.
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
        // Inline conservative fast-reject (same guard as resolveCollisionPair's,
        // the `+1` swamps float rounding) so the ~99% of non-colliding candidates
        // never pay the function-call overhead. Only genuine (or borderline)
        // overlaps fall through to the shared push routine — byte-identical.
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
 * Locally relax only the nodes an expand made **newly visible** (2026-07-31).
 *
 * `relaxScope` is fixed once, when the world is built and nothing is expanded,
 * so expanding a chip makes its children appear **on their raw seed
 * coordinates**. Phyllotaxis spacing already keeps one parent's children apart
 * (measured: 0 overlaps), but they **do overlap other parents' fans**: 5 cases
 * at 3 expands, 18 at 6, 70 at 12.
 *
 * Relaxing everything again makes two things worse: ① the cost accumulates
 * (141ms at 12 expands, 341ms at 24) and ② **nodes the user was already looking
 * at move** (up to 15 units), so the ground shifts under them. So items holds
 * exactly two groups — newly visible nodes, which are relaxed, and already-placed
 * nodes near that bbox, which are pinned obstacles.
 *
 * The spatial neighbourhood is **constant** regardless of how many expands have
 * happened (measured: 107–134 items per click, the same on the 2nd as the 12th),
 * because fans are bounded (phyllotaxis disc).
 *
 * `points` is mutated **in place** — the caller uses those world coordinates
 * directly.
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

  // 1) bbox of the newly visible nodes — only this neighbourhood can collide.
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
  // Margin = the two largest radii + padding. Anything further cannot reach, in principle.
  const maxRadius = Math.max(radii.project, radii.domain, radii.capability, radii.element);
  const margin = 2 * maxRadius + padding;

  // 2) items = newly visible (free) + bbox neighbours (pinned).
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
