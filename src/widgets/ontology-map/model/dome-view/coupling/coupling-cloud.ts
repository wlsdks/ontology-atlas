import { BarnesHutOctree, CollisionHashGrid } from './cloud-spatial-index';
import { clusterRadius, clusterVolumeAnchors } from './cluster-volume';
import { findCouplingGroups } from './coupling-groups';
import { clusterDomainOf } from '../neural/neural-cells';
import { DOME_PITCH_DEFAULT, DOME_YAW_DEFAULT } from '../camera/orbit';
import { DOME_FIT_RADIUS } from '../camera/projection';
import type { DomeCoord, DomeInputNode, DomeViewKind } from '../dome-shapes';

/**
 * Dome-unit radii, now only the collision radius the coupling cloud relaxes
 * against; `DOME_NODE_PX` decides screen size.
 */
const DOME_NODE_R: Readonly<Record<DomeViewKind, number>> = {
  project: 10.5,
  domain: 4.6,
  capability: 3.1,
  element: 2.05,
};

/**
 * The coupling cloud writes no rules into geometry: height is decided by relations too, or
 * it is only a twisted dome. No randomness: it seeds from the ownership coordinates with a
 * fixed iteration count, so a vault always draws the same cloud and switching arrangement
 * keeps spatial memory.
 */
/**
 * A ceiling, not a target: relaxation stops earlier on convergence (`settleEpsilon`). Low
 * enough to keep the transition near the 100 ms "instant" limit (Nielsen 1993).
 */
export const CLOUD_ITERATIONS = 260;
/** Inverse-square in distance. */
const CLOUD_REPULSION = 16000;
/** A Hooke spring along each relation. */
const CLOUD_SPRING = 0.02;
const CLOUD_COHESION = 0.02;
const CLOUD_LOCAL_REPULSION = 0.25;
const CLOUD_REST_LENGTH = 92;
/** A cluster's warm start opens to this share of its reach, leaving springs room to settle it. */
const CLOUD_SEED_SHARE_OF_REACH = 0.9;
/** Weak, so members spread to fill their cluster's reach rather than crowd its heart. */
const CLOUD_DOMAIN_MEMBER_PULL = 0.04;
/** The most one axis of a drawn cluster is stretched, so two members on a line do not fly apart. */
const CLUSTER_ROUND_MAX_STRETCH = 4;
/** A relation between two clusters pulls this much of a relation inside one, so clusters keep apart. */
const CLOUD_CROSS_DOMAIN_SPRING_SHARE = 0.15;

/**
 * Finite-step repulsion guarantees nothing, so each iteration ends with a position
 * correction that pushes discs until they do not overlap (as d3-force `forceCollide`). The
 * base is the per-kind `DOME_NODE_R`; 2.4 leaves room for another disc between two.
 */
const CLOUD_COLLIDE_RADIUS_SCALE = 2.4;
/** 1.0 oscillates, so resolve half at a time. */
const CLOUD_COLLIDE_RELAX = 0.5;

/** Keeps the cloud from inflating without bound. */
const CLOUD_CENTERING = 0.0016;
/** Runaway guard. */
const CLOUD_MAX_STEP = 9;
/** Up to this node count every iteration runs; above it iterations drop so time stays nearer linear. */
const CLOUD_FULL_ITERATION_NODE_CAP = 400;
const CLOUD_EXACT_MAX_NODES = 400;
const CLOUD_COLLISION_CELL = 2 * DOME_NODE_R.element * 2.1 * CLOUD_COLLIDE_RADIUS_SCALE;

/**
 * Relaxation is O(n²) per iteration up to `CLOUD_EXACT_MAX_NODES` and O(n log n) above it,
 * sliced across frames: `step(budgetMs)` resumes where it paused, so the result stays
 * bit-identical, and every finished iteration rewrites `coords` normalised for a live picture.
 */
interface CouplingCloudRelaxer {
  /** True once finished, convergence included. */
  step(budgetMs: number): boolean;
}

export function createCouplingCloudRelaxer(
  coords: Map<string, DomeCoord>,
  nodes: readonly DomeInputNode[],
  edges: readonly { sourceId: string; targetId: string }[],
): CouplingCloudRelaxer {
  const ids = nodes.map((n) => n.id).filter((id) => coords.has(id));
  const n = ids.length;
  if (n < 2) return { step: () => true };
  const index = new Map(ids.map((id, i) => [id, i]));

  const drawn = ids.map((id) => coords.get(id)!);
  const px = Float64Array.from(drawn, (c) => c.px);
  const py = Float64Array.from(drawn, (c) => c.py);
  const pz = Float64Array.from(drawn, (c) => c.pz);

  const links: Array<[number, number]> = [];
  for (const e of edges) {
    const a = index.get(e.sourceId);
    const b = index.get(e.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    links.push([a, b]);
  }

  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]));
  const collideR = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const kind = kindOf.get(ids[i]) ?? "element";
    collideR[i] = DOME_NODE_R[kind] * 2.1 * CLOUD_COLLIDE_RADIUS_SCALE;
  }

  /*
   * Each domain is drawn toward its anchor (`cluster-volume.ts`, in id order)
   * and its members toward the domain, so "whose is this" has a place. A layout aid over the
   * declared `contains` chain; no edge is invented and springs decide inside a cluster.
   */
  const clusterOf = clusterDomainOf(nodes);
  const domainIndexOf = new Int32Array(n).fill(-1);
  const domainIds = ids.filter((id) => kindOf.get(id) === "domain").sort();
  const domainSlot = new Map(domainIds.map((id, k) => [id, k]));
  for (let i = 0; i < n; i += 1) {
    const domain = clusterOf.get(ids[i]);
    const slot = domain === undefined ? undefined : domainSlot.get(domain);
    if (slot !== undefined) domainIndexOf[i] = slot;
  }
  const domainNodeIndex = domainIds.map((id) => index.get(id)!);
  const membersOf = new Uint32Array(domainIds.length);
  for (let i = 0; i < n; i += 1) if (domainIndexOf[i] >= 0) membersOf[domainIndexOf[i]] += 1;
  const reachOf = Float64Array.from(membersOf, clusterRadius);
  // Concepts no domain reaches, the project among them, gather as one group at the pack's centre.
  let looseCount = 0;
  for (let i = 0; i < n; i += 1) if (domainIndexOf[i] < 0) looseCount += 1;
  const looseReach = domainIds.length >= 2 ? clusterRadius(looseCount) : Infinity;
  const { anchors, centre } = clusterVolumeAnchors(Array.from(reachOf), DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT, Number.isFinite(looseReach) ? looseReach : 0);
  const anchorX = Float64Array.from(anchors, (a) => a.x);
  const anchorY = Float64Array.from(anchors, (a) => a.y);
  const anchorZ = Float64Array.from(anchors, (a) => a.z);
  seedClustersAtAnchors();

  /** Moves each cluster's warm start onto its anchor, its spread scaled to fit its reach. O(n). */
  function seedClustersAtAnchors(): void {
    const spread = new Float64Array(domainIds.length);
    for (let i = 0; i < n; i += 1) {
      const slot = domainIndexOf[i];
      if (slot < 0) continue;
      const d = domainNodeIndex[slot];
      spread[slot] = Math.max(spread[slot], Math.hypot(px[i] - px[d], py[i] - py[d], pz[i] - pz[d]));
    }
    const heartX = Float64Array.from(domainNodeIndex, (d) => px[d]);
    const heartY = Float64Array.from(domainNodeIndex, (d) => py[d]);
    const heartZ = Float64Array.from(domainNodeIndex, (d) => pz[d]);
    if (Number.isFinite(looseReach)) {
      for (let i = 0; i < n; i += 1) {
        if (domainIndexOf[i] >= 0) continue;
        const r = Math.hypot(px[i], pz[i]) || 1;
        const k = Math.min(1, (looseReach * CLOUD_SEED_SHARE_OF_REACH) / r);
        px[i] = centre.x + px[i] * k; py[i] = centre.y; pz[i] = centre.z + pz[i] * k;
      }
    }
    for (let i = 0; i < n; i += 1) {
      const slot = domainIndexOf[i];
      if (slot < 0) continue;
      const k = spread[slot] > 1e-6 ? (reachOf[slot] * CLOUD_SEED_SHARE_OF_REACH) / spread[slot] : 0;
      px[i] = anchorX[slot] + (px[i] - heartX[slot]) * k;
      py[i] = anchorY[slot] + (py[i] - heartY[slot]) * k;
      pz[i] = anchorZ[slot] + (pz[i] - heartZ[slot]) * k;
    }
  }

  /** Each heart stands on its anchor and no member leaves its cluster's reach, so clusters never meet. O(n). */
  function holdClusters(): void {
    for (let k = 0; k < domainNodeIndex.length; k += 1) {
      const d = domainNodeIndex[k];
      px[d] = anchorX[k]; py[d] = anchorY[k]; pz[d] = anchorZ[k];
    }
    for (let i = 0; i < n; i += 1) {
      const slot = domainIndexOf[i];
      const cx = slot >= 0 ? anchorX[slot] : centre.x;
      const cy = slot >= 0 ? anchorY[slot] : centre.y;
      const cz = slot >= 0 ? anchorZ[slot] : centre.z;
      const reach = slot >= 0 ? reachOf[slot] : looseReach;
      const dx = px[i] - cx;
      const dy = py[i] - cy;
      const dz = pz[i] - cz;
      const d = Math.hypot(dx, dy, dz);
      if (d <= reach) continue;
      const k = reach / d;
      px[i] = cx + dx * k; py[i] = cy + dy * k; pz[i] = cz + dz * k;
    }
  }

  const linkSpring = Float64Array.from(links, ([a, b]) =>
    domainIndexOf[a] >= 0 && domainIndexOf[b] >= 0 && domainIndexOf[a] !== domainIndexOf[b]
      ? CLOUD_SPRING * CLOUD_CROSS_DOMAIN_SPRING_SHARE
      : CLOUD_SPRING);

  const groups = findCouplingGroups(ids, edges);
  const groupCount = groups.reduce((largest, group) => Math.max(largest, group), -1) + 1;
  const groupSize = new Uint32Array(groupCount);
  const groupX = new Float64Array(groupCount);
  const groupY = new Float64Array(groupCount);
  const groupZ = new Float64Array(groupCount);
  for (const group of groups) groupSize[group] += 1;

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const fz = new Float64Array(n);
  const iterations =
    n <= CLOUD_FULL_ITERATION_NODE_CAP
      ? CLOUD_ITERATIONS
      : Math.max(60, Math.round((CLOUD_ITERATIONS * CLOUD_FULL_ITERATION_NODE_CAP) / n));

  /**
   * Stop once the largest move in an iteration falls below this; a constant, so identical
   * input stops at the identical iteration.
   */
  const settleEpsilon = 0.05;

  let iter = 0;
  let settled = false;
  let done = false;
  let row = 0;
  let phase: "between" | "repel" | "collide" = "between";

  const tree = n > CLOUD_EXACT_MAX_NODES;
  const octree = new BarnesHutOctree();
  const allPoints = Int32Array.from(ids, (_, i) => i);
  const groupStart = new Int32Array(groupCount + 1);
  for (let g = 0; g < groupCount; g += 1) groupStart[g + 1] = groupStart[g] + groupSize[g];
  const byGroup = new Int32Array(n);
  const slotOf = new Int32Array(n);
  const nextSlot = groupStart.slice(0, groupCount);
  for (let i = 0; i < n; i += 1) {
    slotOf[i] = nextSlot[groups[i]]++;
    byGroup[slotOf[i]] = i;
  }
  const groupTrees: Array<BarnesHutOctree | undefined> = [];
  for (let g = 0; tree && g < groupCount; g += 1) {
    if (groupSize[g] > CLOUD_EXACT_MAX_NODES) groupTrees[g] = new BarnesHutOctree();
  }
  const grid = new CollisionHashGrid();
  const pushed = new Float64Array(3);
  const localShare = CLOUD_REPULSION * (1 - CLOUD_LOCAL_REPULSION);

  const beginIteration = (): void => {
    fx.fill(0);
    fy.fill(0);
    fz.fill(0);
    row = 0;
    phase = "repel";
    if (!tree) return;
    octree.build(px, py, pz, allPoints, n);
    groupTrees.forEach((own, g) => own?.build(px, py, pz, byGroup.subarray(groupStart[g]), groupSize[g]));
  };
  const runPairRows = (deadlineMs: number): boolean => {
    while (row < n) {
      const i = row;
      for (let j = i + 1; j < n; j += 1) {
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let dz = pz[i] - pz[j];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) {
          // Coincident pairs separate by index, not a random number, to stay deterministic.
          dx = (i - j) * 1e-3;
          dy = 1e-3;
          dz = (j - i) * 1e-3;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const d = Math.sqrt(d2);

        const affinity = groups[i] === groups[j] ? CLOUD_LOCAL_REPULSION : 1;
        const inv = CLOUD_REPULSION * affinity / d2 / d;
        const ux = dx * inv;
        const uy = dy * inv;
        const uz = dz * inv;
        fx[i] += ux;
        fy[i] += uy;
        fz[i] += uz;
        fx[j] -= ux;
        fy[j] -= uy;
        fz[j] -= uz;

        const want = collideR[i] + collideR[j];
        if (d < want) {
          const push = ((want - d) / d) * CLOUD_COLLIDE_RELAX * 0.5;
          px[i] += dx * push;
          py[i] += dy * push;
          pz[i] += dz * push;
          px[j] -= dx * push;
          py[j] -= dy * push;
          pz[j] -= dz * push;
        }
      }
      row += 1;
      if ((row & 15) === 0 && performance.now() >= deadlineMs) return false;
    }
    return true;
  };
  const runTreeRows = (deadlineMs: number): boolean => {
    while (row < n) {
      const i = row;
      pushed.fill(0);
      octree.accumulate(i, CLOUD_REPULSION, pushed);
      fx[i] += pushed[0];
      fy[i] += pushed[1];
      fz[i] += pushed[2];
      const group = groups[i];
      const own = groupTrees[group];
      if (own !== undefined) {
        pushed.fill(0);
        own.accumulate(i, localShare, pushed);
        fx[i] -= pushed[0];
        fy[i] -= pushed[1];
        fz[i] -= pushed[2];
      } else {
        for (let k = slotOf[i] + 1; k < groupStart[group + 1]; k += 1) {
          const j = byGroup[k];
          let dx = px[i] - px[j];
          let dy = py[i] - py[j];
          let dz = pz[i] - pz[j];
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 1e-6) {
            dx = (i - j) * 1e-3;
            dy = 1e-3;
            dz = (j - i) * 1e-3;
            d2 = dx * dx + dy * dy + dz * dz;
          }
          const inv = localShare / (d2 * Math.sqrt(d2));
          fx[i] -= dx * inv;
          fy[i] -= dy * inv;
          fz[i] -= dz * inv;
          fx[j] += dx * inv;
          fy[j] += dy * inv;
          fz[j] += dz * inv;
        }
      }
      row += 1;
      if ((row & 15) === 0 && performance.now() >= deadlineMs) return false;
    }
    return true;
  };
  const runCollideRows = (deadlineMs: number): boolean => {
    while (row < n) {
      grid.separate(row, px, py, pz, collideR, CLOUD_COLLIDE_RELAX);
      row += 1;
      if ((row & 63) === 0 && performance.now() >= deadlineMs) return false;
    }
    return true;
  };
  const finishIteration = (): void => {
    for (let k = 0; k < links.length; k += 1) {
      const [a, b] = links[k];
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const dz = pz[b] - pz[a];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const pull = (d - CLOUD_REST_LENGTH) * linkSpring[k];
      const ux = (dx / d) * pull;
      const uy = (dy / d) * pull;
      const uz = (dz / d) * pull;
      fx[a] += ux;
      fy[a] += uy;
      fz[a] += uz;
      fx[b] -= ux;
      fy[b] -= uy;
      fz[b] -= uz;
    }

    // Cohesion is a layout aid, not an edge; singleton groups exert no pull.
    groupX.fill(0); groupY.fill(0); groupZ.fill(0);
    for (let i = 0; i < n; i += 1) {
      const group = groups[i];
      groupX[group] += px[i]; groupY[group] += py[i]; groupZ[group] += pz[i];
    }
    for (let i = 0; i < n; i += 1) {
      const group = groups[i];
      const size = groupSize[group];
      fx[i] += (groupX[group] / size - px[i]) * CLOUD_COHESION;
      fy[i] += (groupY[group] / size - py[i]) * CLOUD_COHESION;
      fz[i] += (groupZ[group] / size - pz[i]) * CLOUD_COHESION;
    }

    for (let i = 0; i < n; i += 1) {
      const slot = domainIndexOf[i];
      if (slot < 0) continue;
      const d = domainNodeIndex[slot];
      if (d === i) continue;
      fx[i] += (px[d] - px[i]) * CLOUD_DOMAIN_MEMBER_PULL;
      fy[i] += (py[d] - py[i]) * CLOUD_DOMAIN_MEMBER_PULL;
      fz[i] += (pz[d] - pz[i]) * CLOUD_DOMAIN_MEMBER_PULL;
    }

    const cool = 1 - iter / iterations;
    let maxStep = 0;
    for (let i = 0; i < n; i += 1) {
      fx[i] -= px[i] * CLOUD_CENTERING;
      fy[i] -= py[i] * CLOUD_CENTERING;
      fz[i] -= pz[i] * CLOUD_CENTERING;
      const step = Math.hypot(fx[i], fy[i], fz[i]);
      const scale = (step > CLOUD_MAX_STEP ? CLOUD_MAX_STEP / step : 1) * cool;
      const mx2 = fx[i] * scale;
      const my2 = fy[i] * scale;
      const mz2 = fz[i] * scale;
      px[i] += mx2;
      py[i] += my2;
      pz[i] += mz2;
      const moved = Math.hypot(mx2, my2, mz2);
      if (moved > maxStep) maxStep = moved;
    }
    holdClusters();
    if (maxStep < settleEpsilon) settled = true;
    iter += 1;
    phase = "between";
  };

  const roundX = new Float64Array(n);
  const roundY = new Float64Array(n);
  const roundZ = new Float64Array(n);
  /**
   * Members pressed against their cluster's reach form a slab that is thin along one axis, so the
   * cluster reads narrow. The drawn copy stretches each cluster's thinner axes (radial, tangential,
   * height) until their spread matches its widest, inside its reach; the relaxation is untouched. O(n).
   */
  function roundClusters(): void {
    roundX.set(px.subarray(0, n)); roundY.set(py.subarray(0, n)); roundZ.set(pz.subarray(0, n));
    const k = domainIds.length;
    if (k === 0) return;
    const extent = new Float64Array(k * 3);
    const axisOf = (slot: number, i: number): [number, number, number] => {
      const rl = Math.hypot(anchorX[slot], anchorZ[slot]);
      const ux = rl > 1e-6 ? anchorX[slot] / rl : 1;
      const uz = rl > 1e-6 ? anchorZ[slot] / rl : 0;
      const dx = px[i] - anchorX[slot];
      const dz = pz[i] - anchorZ[slot];
      return [dx * ux + dz * uz, -dx * uz + dz * ux, py[i] - anchorY[slot]];
    };
    for (let i = 0; i < n; i += 1) {
      const slot = domainIndexOf[i];
      if (slot < 0) continue;
      const [r, t, h] = axisOf(slot, i);
      extent[slot * 3] += r * r;
      extent[slot * 3 + 1] += t * t;
      extent[slot * 3 + 2] += h * h;
    }
    for (let i = 0; i < n; i += 1) {
      const slot = domainIndexOf[i];
      if (slot < 0) continue;
      const widest = Math.max(extent[slot * 3], extent[slot * 3 + 1], extent[slot * 3 + 2]);
      const stretch = (axis: number) => {
        const e = extent[slot * 3 + axis];
        return e > 1e-9 ? Math.min(CLUSTER_ROUND_MAX_STRETCH, Math.sqrt(widest / e)) : 1;
      };
      const [r, t, h] = axisOf(slot, i);
      let a = r * stretch(0);
      let b = t * stretch(1);
      let c = h * stretch(2);
      const d = Math.hypot(a, b, c);
      if (d > reachOf[slot]) {
        const shrink = reachOf[slot] / d;
        a *= shrink; b *= shrink; c *= shrink;
      }
      const rl = Math.hypot(anchorX[slot], anchorZ[slot]);
      const ux = rl > 1e-6 ? anchorX[slot] / rl : 1;
      const uz = rl > 1e-6 ? anchorZ[slot] / rl : 0;
      roundX[i] = anchorX[slot] + a * ux - b * uz;
      roundZ[i] = anchorZ[slot] + a * uz + b * ux;
      roundY[i] = anchorY[slot] + c;
    }
  }

  let written = -1;
  /*
   * Centre the mass on the origin: rotation turns about the origin, so an off-centre cloud
   * swings off screen under a small drag.
   */
  const writeNormalized = (): void => {
    if (written === iter) return;
    written = iter;
    roundClusters();
    let mx = 0;
    let my = 0;
    let mz = 0;
    // The cluster volume is centred on the origin by construction.
    if (domainIds.length < 2) {
      for (let i = 0; i < n; i += 1) {
        mx += roundX[i];
        my += roundY[i];
        mz += roundZ[i];
      }
      mx /= n;
      my /= n;
      mz /= n;
    }

    // Normalised so camera fit and fog see the dome's scale.
    let maxR = 0;
    for (let i = 0; i < n; i += 1) {
      const r = Math.hypot(roundX[i] - mx, roundY[i] - my, roundZ[i] - mz);
      if (r > maxR) maxR = r;
    }
    const norm = maxR > 1e-6 ? DOME_FIT_RADIUS / maxR : 1;
    for (let i = 0; i < n; i += 1) {
      drawn[i].px = (roundX[i] - mx) * norm;
      drawn[i].py = (roundY[i] - my) * norm;
      drawn[i].pz = (roundZ[i] - mz) * norm;
    }
  };
  writeNormalized();

  return {
    step(budgetMs: number): boolean {
      if (done) return true;
      const deadline = performance.now() + budgetMs;
      while (iter < iterations && !settled) {
        if (phase === "between") beginIteration();
        if (phase === "repel") {
          if (!(tree ? runTreeRows(deadline) : runPairRows(deadline))) break;
          if (tree) {
            grid.build(px, py, pz, n, CLOUD_COLLISION_CELL);
            row = 0;
            phase = "collide";
          }
        }
        if (phase === "collide" && !runCollideRows(deadline)) break;
        if (phase !== "between") finishIteration();
        if (performance.now() >= deadline) break;
      }
      done = iter >= iterations || settled;
      writeNormalized();
      return done;
    },
  };
}
