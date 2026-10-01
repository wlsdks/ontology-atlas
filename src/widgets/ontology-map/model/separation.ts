/**
 * Minimum-separation relaxation, pure and deterministic, so the force sim and drag tug
 * cannot push a child onto its parent. Call only on frames the sim is active; homing
 * already lands on a non-overlapping layout and relaxing would scatter it.
 */

export interface SeparationNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface SeparationOptions {
  /** Push apart below (rA+rB)×ratio. */
  ratio: number;
  iterations: number;
  /** The node pinned under the drag. */
  pinnedId?: string | null;
  /**
   * The nodes that moved this frame. Pairs of two stationary nodes are skipped, since they did
   * not overlap last frame; a pushed node joins the set, so chains like A→B→C still resolve.
   * Omitted, every node is active and the scan is quadratic.
   */
  activeIds?: ReadonlySet<string> | null;
}

/** Moves only the other node when one is pinned. Mutates in place. */
export function relaxNodeSeparation(nodes: SeparationNode[], options: SeparationOptions): void {
  const { ratio, iterations, pinnedId = null, activeIds = null } = options;
  const n = nodes.length;
  // Index flags: one array read in the inner loop is cheaper than two Set lookups.
  const active = activeIds ? nodes.map((node) => activeIds.has(node.id)) : null;
  /*
   * An inactive `i` scans only the ascending active list, so its cost is O(active) instead of
   * O(N) while pairs and their order stay identical; order is the result, since coordinates
   * change in place. This matters where nothing folds (the 3D dome lays out every node).
   */
  let activeIdx: number[] | null = null;
  if (active !== null) {
    activeIdx = [];
    for (let i = 0; i < n; i += 1) if (active[i]) activeIdx.push(i);
  }
  const enlist = (k: number): void => {
    if (active === null || activeIdx === null || active[k]) return;
    active[k] = true;
    let lo = 0;
    let hi = activeIdx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (activeIdx[mid] < k) lo = mid + 1;
      else hi = mid;
    }
    activeIdx.splice(lo, 0, k);
  };
  const lowerBound = (list: number[], value: number): number => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** True if it pushed, which drives chain propagation. */
  const resolvePair = (i: number, j: number): boolean => {
    const a = nodes[i];
    const b = nodes[j];
    const minDist = (a.r + b.r) * ratio;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (Math.abs(dx) >= minDist || Math.abs(dy) >= minDist) return false;
    let dist = Math.hypot(dx, dy);
    if (dist >= minDist) return false;
    if (dist < 1e-6) {
      // Identical coordinates push horizontally, deterministically.
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const push = (minDist - dist) / dist;
    const px = dx * push;
    const py = dy * push;
    if (a.id === pinnedId) {
      b.x += px;
      b.y += py;
    } else if (b.id === pinnedId) {
      a.x -= px;
      a.y -= py;
    } else {
      a.x -= px / 2;
      a.y -= py / 2;
      b.x += px / 2;
      b.y += py / 2;
    }
    return true;
  };

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < n; i += 1) {
      // `iActive` is read once before the j loop, so an `i` activated mid-loop does not change
      // this pass's enumeration.
      const iActive = active === null || active[i];
      if (iActive) {
        for (let j = i + 1; j < n; j += 1) {
          if (!resolvePair(i, j)) continue;
          // Chain propagation: without it A→B→C never resolves and overlaps remain.
          enlist(i);
          enlist(j);
        }
      } else if (activeIdx !== null) {
        // Only `i` can become newly active here, and enlisting it now would shift the cursor, so it
        // is enlisted after the j loop.
        let selfMoved = false;
        for (let p = lowerBound(activeIdx, i + 1); p < activeIdx.length; p += 1) {
          if (resolvePair(i, activeIdx[p])) selfMoved = true;
        }
        if (selfMoved) enlist(i);
      }
    }
  }
}
