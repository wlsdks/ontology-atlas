import {
  CONE_STAGGER_FROM,
  CONE_STAGGER_OUT,
  DOME_PLANE,
  domeHash01,
  TAU,
} from './cone-layout';
import type { DomeCircle, DomeCoord, DomeInputNode, DomeSector, DomeViewKind } from './types';

/**
 * Strata: the tiers as four stacked planes at the cone's `DOME_PLANE` heights; height is the tier.
 * Children split their parent's sector by subtree size, so containment drops from different parents
 * cannot cross (`dome-view.test.ts`). The cost is a wider silhouette than the cone.
 */

/**
 * The outer fifth is the rim, where an unparented node lands, so "nothing above holds this"
 * is a visible position.
 */
const STRATA_PLACED_FILL = 0.82;
const STRATA_STAGGER_IN = 0.92;

/**
 * The cone's apex needs no radius, but Strata rings every plane; 34 clears the project disc
 * by more than two of its radii, so the ring reads as a disc it stands in.
 */
const STRATA_PROJECT_RING_R = 34;

/**
 * A cutoff, not a target: the loop also stops on a sweep that changes nothing. Barycenter
 * oscillates, so the best ordering seen is kept, as `dot` does (Gansner et al., 1993). The
 * sweeps chiefly cut crossings between containment drops, the fan Strata exists to show.
 */
const STRATA_BARYCENTER_SWEEPS = 6;

/**
 * Scoring counts crossings, O(E²) per sweep: cheap at the few hundred relations a real
 * vault has, too slow in a build that must not hitch beyond this. Past it the sweeps run
 * unscored.
 */
const STRATA_SCORED_EDGE_BUDGET = 800;

/**
 * Containment and dependency chords seen from above, independent of the camera pose the
 * reader may leave. Relations sharing a node are not counted. O(E²).
 */
function strataCrossings(
  coords: ReadonlyMap<string, DomeCoord>,
  edges: readonly { sourceId: string; targetId: string }[],
): number {
  const segs: { ax: number; az: number; bx: number; bz: number; a: string; b: string }[] = [];
  for (const e of edges) {
    const a = coords.get(e.sourceId);
    const b = coords.get(e.targetId);
    if (!a || !b) continue;
    segs.push({ ax: a.px, az: a.pz, bx: b.px, bz: b.pz, a: e.sourceId, b: e.targetId });
  }
  const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
    Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  let count = 0;
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      const s = segs[i];
      const t = segs[j];
      if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
      const d1 = side(s.ax, s.az, s.bx, s.bz, t.ax, t.az);
      const d2 = side(s.ax, s.az, s.bx, s.bz, t.bx, t.bz);
      const d3 = side(t.ax, t.az, t.bx, t.bz, s.ax, s.az);
      const d4 = side(t.ax, t.az, t.bx, t.bz, s.bx, s.bz);
      if (d1 !== d2 && d3 !== d4) count += 1;
    }
  }
  return count;
}

/**
 * Pure and deterministic (siblings sorted by id first, no randomness or clock). `edges` only
 * order siblings inside a sector; they never move a node between planes or sectors.
 * At most `STRATA_BARYCENTER_SWEEPS` sweeps, each O(N log N + E) plus O(E²) crossing
 * scoring while E stays within `STRATA_SCORED_EDGE_BUDGET`.
 */
export function buildStrataTargets(
  nodes: readonly DomeInputNode[],
  edges: readonly { sourceId: string; targetId: string }[] = [],
): {
  coords: Map<string, DomeCoord>;
  circles: DomeCircle[];
  sectors: DomeSector[];
} {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const coords = new Map<string, DomeCoord>();
  const byIdAsc = (a: DomeInputNode, b: DomeInputNode) => (a.id < b.id ? -1 : 1);

  const kids = new Map<string, DomeInputNode[]>();
  for (const n of nodes) {
    if (n.parentId === null || !byId.has(n.parentId) || n.parentId === n.id) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  for (const list of kids.values()) list.sort(byIdAsc);

  /** The angular weight it claims; cycles are cut at the first repeat. */
  const weightMemo = new Map<string, number>();
  const weightOf = (id: string, trail: Set<string>): number => {
    const memo = weightMemo.get(id);
    if (memo !== undefined) return memo;
    if (trail.has(id)) return 1;
    trail.add(id);
    let w = 1;
    for (const k of kids.get(id) ?? []) w += weightOf(k.id, trail);
    trail.delete(id);
    weightMemo.set(id, w);
    return w;
  };

  const projects = nodes.filter((n) => n.kind === "project").sort(byIdAsc);
  /** Id order first, then reordered by the sweeps. */
  const orderOf = new Map<string, DomeInputNode[]>();
  for (const [parentId, list] of kids) orderOf.set(parentId, [...list]);
  const bearingOf = new Map<string, number>();

  /** So one subtree can be re-dealt without redoing the walk. */
  const sectorOf = new Map<string, readonly [number, number, number, number]>();
  /**
   * Seat a node mid-sector and deal the sector to its children; `index`/`siblings` choose only
   * the lane radius, and the bearing never leaves the sector, or a drop could cross.
   */
  const place = (node: DomeInputNode, from: number, to: number, index: number, siblings: number): void => {
    sectorOf.set(node.id, [from, to, index, siblings]);
    const mid = (from + to) / 2;
    const planeR = node.kind === "project" ? STRATA_PROJECT_RING_R : DOME_PLANE[node.kind].r;
    // A lone project is the axis; two or more share the top plane's ring.
    const onAxis = node.kind === "project" && projects.length <= 1;
    const r = onAxis ? 0 : planeR * STRATA_PLACED_FILL;
    bearingOf.set(node.id, mid);
    coords.set(node.id, { px: Math.cos(mid) * r, py: DOME_PLANE[node.kind].y, pz: Math.sin(mid) * r });

    const children = orderOf.get(node.id) ?? [];
    if (children.length === 0) return;
    let total = 0;
    for (const c of children) total += weightOf(c.id, new Set());
    let cursor = from;
    children.forEach((child, i) => {
      const share = ((weightOf(child.id, new Set()) || 1) / (total || 1)) * (to - from);
      place(child, cursor, cursor + share, i, children.length);
      cursor += share;
    });
  };

  /*
   * Two lanes preserve sector bearings. Strata's inner lane leaves more arc length than the
   * cone's parent-local stagger, keeping projected peers apart at narrow fits. This runs
   * inside `layout`, so the crossing score reads the drawn geometry.
   */
  const applyLanes = (): void => {
    for (const kind of STRATA_PLANE_ORDER) {
      if (kind === "project") continue;
      const lane = [...coords.entries()]
        .filter(([id]) => byId.get(id)?.kind === kind)
        .map(([id, c]) => ({ id, c, bearing: Math.atan2(c.pz, c.px) }))
        .sort((a, b) => (a.bearing !== b.bearing ? a.bearing - b.bearing : a.id < b.id ? -1 : 1));
      if (lane.length <= CONE_STAGGER_FROM) continue;
      lane.forEach((entry, i) => {
        const r = DOME_PLANE[kind].r * STRATA_PLACED_FILL * (i % 2 ? CONE_STAGGER_OUT : STRATA_STAGGER_IN);
        entry.c.px = Math.cos(entry.bearing) * r;
        entry.c.pz = Math.sin(entry.bearing) * r;
      });
    }
  };

  const layout = (): void => {
    coords.clear();
    bearingOf.clear();
    sectorOf.clear();
    // Projects share the full turn; −π/2 starts at the top of the disc, the cone's zero.
    let projectTotal = 0;
    for (const p of projects) projectTotal += weightOf(p.id, new Set());
    let cursor = -Math.PI / 2;
    projects.forEach((p, i) => {
      const share = ((weightOf(p.id, new Set()) || 1) / (projectTotal || 1)) * TAU;
      place(p, cursor, cursor + share, i, projects.length);
      cursor += share;
    });
    applyLanes();
  };
  layout();

  /*
   * Barycenter crossing reduction (Sugiyama, Tagawa & Toda, 1981) for the dependency arcs,
   * which sector inheritance leaves to chance. Radial adaptations after Bachmaier (IEEE TVCG
   * 13(3), 2007): the key is a circular mean, since averaging 10° and 350° gives 180°, and
   * is read as an offset from the parent's bearing. A node permutes only among its siblings,
   * or "this capability sits under that domain" breaks. Containment edges stay out of the
   * key, since the sector already encodes them.
   */
  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    const a = byId.get(edge.sourceId);
    const b = byId.get(edge.targetId);
    if (!a || !b || a === b) continue;
    if (a.parentId === b.id || b.parentId === a.id) continue;
    (neighbours.get(a.id) ?? neighbours.set(a.id, []).get(a.id)!).push(b.id);
    (neighbours.get(b.id) ?? neighbours.set(b.id, []).get(b.id)!).push(a.id);
  }
  if (neighbours.size > 0) {
    const offsetFrom = (angle: number, origin: number): number => {
      let d = angle - origin;
      while (d > Math.PI) d -= TAU;
      while (d <= -Math.PI) d += TAU;
      return d;
    };
    const scored = edges.length <= STRATA_SCORED_EDGE_BUDGET;
    let bestOrder = scored ? new Map([...orderOf].map(([k, v]) => [k, [...v]])) : null;
    let bestCount = scored ? strataCrossings(coords, edges) : 0;
    /*
     * Each subtree is re-dealt the moment its order changes (Gauss-Seidel), so the next parent
     * sees current positions; with stale positions both ends of a same-layer edge swap past
     * each other and the crossing survives.
     */
    const parentIds = [...orderOf.keys()].sort();
    for (let sweep = 0; sweep < STRATA_BARYCENTER_SWEEPS; sweep += 1) {
      let changed = false;
      for (const parentId of parentIds) {
        const children = orderOf.get(parentId) ?? [];
        if (children.length < 2) continue;
        const parentBearing = bearingOf.get(parentId) ?? 0;
        const keyed = children.map((child, index) => {
          let sx = 0;
          let sz = 0;
          let seen = 0;
          for (const other of neighbours.get(child.id) ?? []) {
            const a = bearingOf.get(other);
            if (a === undefined) continue;
            sx += Math.cos(a);
            sz += Math.sin(a);
            seen += 1;
          }
          // No relation, or neighbours that cancel exactly: stay put rather than shuffle for nothing.
          const key =
            seen === 0 || Math.hypot(sx, sz) < 1e-9
              ? offsetFrom(bearingOf.get(child.id) ?? parentBearing, parentBearing)
              : offsetFrom(Math.atan2(sz, sx), parentBearing);
          return { child, key, index };
        });
        keyed.sort((a, b) =>
          a.key !== b.key ? a.key - b.key : a.child.id < b.child.id ? -1 : a.child.id > b.child.id ? 1 : 0,
        );
        let moved = false;
        for (let i = 0; i < keyed.length; i += 1) {
          if (keyed[i].index !== i) {
            moved = true;
            break;
          }
        }
        if (!moved) continue;
        changed = true;
        orderOf.set(
          parentId,
          keyed.map((k) => k.child),
        );
        const sector = sectorOf.get(parentId);
        const parent = byId.get(parentId);
        if (sector && parent) place(parent, sector[0], sector[1], sector[2], sector[3]);
      }
      if (!changed) break;
      // Re-deals wrote base radii; restore the lanes so the score reads the drawn geometry.
      applyLanes();
      if (!scored) continue;
      const count = strataCrossings(coords, edges);
      if (count < bestCount) {
        bestCount = count;
        bestOrder = new Map([...orderOf].map(([k, v]) => [k, [...v]]));
      }
    }
    // Keep the best ordering seen, not the last: the barycenter oscillates.
    if (bestOrder !== null) {
      for (const [k, v] of bestOrder) orderOf.set(k, v);
      layout();
    }
  }

  /*
   * Anything the walk never reached sits on its own plane's rim at a hash bearing: on the
   * right level, and visibly not held by the tier above.
   */
  for (const n of nodes) {
    if (coords.has(n.id)) continue;
    const a = domeHash01(n.id) * TAU;
    const rimR = n.kind === "project" ? STRATA_PROJECT_RING_R : DOME_PLANE[n.kind].r;
    coords.set(n.id, { px: Math.cos(a) * rimR, py: DOME_PLANE[n.kind].y, pz: Math.sin(a) * rimR });
  }

  /* Only planes with something on them, or the ring asserts a level this vault lacks. */
  const circles: DomeCircle[] = [];
  for (const kind of STRATA_PLANE_ORDER) {
    if (!nodes.some((n) => n.kind === kind)) continue;
    const r = kind === "project" ? STRATA_PROJECT_RING_R : DOME_PLANE[kind].r;
    circles.push({ kind, cx: 0, cz: 0, y: DOME_PLANE[kind].y, r, named: true });
  }

  /*
   * Domains and capabilities only: a project's sector is the whole turn, and an element has
   * no plane under it.
   */
  const sectors: DomeSector[] = [];
  for (const [id, [from, to]] of sectorOf) {
    const kind = byId.get(id)?.kind;
    if (kind !== "domain" && kind !== "capability") continue;
    sectors.push({ id, kind, from, to });
  }
  sectors.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { coords, circles, sectors };
}

/** The containment spine of `docs/ONTOLOGY-ATLAS-SPEC.md` §2. */
const STRATA_PLANE_ORDER: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];
