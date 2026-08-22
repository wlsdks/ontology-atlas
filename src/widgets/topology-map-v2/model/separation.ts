/**
 * Minimum-separation relaxation for nodes — pure and deterministic.
 *
 * Reproduced by the design guardian: at the end of the click→dive→reveal
 * journey a revealed element collided head-on with the project hexagon's
 * engraving. The de-pileup layout avoids overlap by placing nodes on rings, but
 * the force sim and drag tug can still push a child on top of its parent.
 *
 * Calling it is the caller's contract: **only on frames where the sim is active**
 * (a drag, or settling after release). Never during homing (auto-arrange or the
 * first-map reveal) — that would scatter the reveal's deliberately gathered
 * state, and homing's destination is already a non-overlapping layout.
 */

export interface SeparationNode {
  id: string;
  x: number;
  y: number;
  /** World radius (radiusForKind). */
  r: number;
}

export interface SeparationOptions {
  /** `--topology-v2-node-min-separation-ratio` — push apart below (rA+rB)×ratio. */
  ratio: number;
  /** Relaxation iterations. */
  iterations: number;
  /** The node that must not move — the one pinned under the drag. */
  pinnedId?: string | null;
  /**
   * **The nodes that actually moved this frame** — the dragged node plus its
   * tugged neighbours.
   *
   * Given it, pairs where *both* are stationary are skipped: two stationary
   * nodes did not overlap last frame, so they cannot start overlapping now. A
   * stationary node that gets pushed joins the active set for the next
   * iteration, so chains like A→B→C still resolve.
   *
   * Omit it and every node is active — **that default was the root of the
   * 2026-07-31 lag**: 9 million distance computations per frame, 99.99% of them
   * between two stationary nodes. The caller already had this set
   * (`dragAffectedSetRef`); only the force sim was being given it, while the
   * overlap resolution was not.
   */
  activeIds?: ReadonlySet<string> | null;
}

/** Pushes overlapping pairs apart symmetrically along their axis — or moves only the other node when one is pinned. Mutates the array in place. */
export function relaxNodeSeparation(nodes: SeparationNode[], options: SeparationOptions): void {
  const { ratio, iterations, pinnedId = null, activeIds = null } = options;
  const n = nodes.length;
  // Turn the active set into index flags: one array read in the inner loop is
  // cheaper than two Set lookups.
  const active = activeIds ? nodes.map((node) => activeIds.has(node.id)) : null;
  /*
   * **Carry the active indices as an ascending list** (measured in 3D, 2026-08-19).
   *
   * Both-stationary pairs were always skipped, but skipping one still meant
   * visiting it — the loops themselves stayed N²/2. In 2D that waste was
   * invisible because the density threshold folds the map down to about a
   * hundred on-screen nodes (101 of 2000 at `synth=2000`), but **the 3D dome
   * folds nothing and lays every node out.** So the same code spent 2 million
   * visits per frame in 3D purely to test and discard, and node-drag p95 came
   * out at 50.9 ms (≈20 fps) where the same scene in 2D cost 3.5 ms.
   *
   * Running the inner loop of an inactive `i` over active `j` only removes the
   * visit entirely. The active list is ascending, so `j` still arrives in the
   * same order, and therefore **neither the set of pairs processed nor their
   * order changes by one position** — this function edits coordinates in place,
   * so order is the result.
   */
  let activeIdx: number[] | null = null;
  if (active !== null) {
    activeIdx = [];
    for (let i = 0; i < n; i += 1) if (active[i]) activeIdx.push(i);
  }
  /** Order-preserving insert — admits a node that has just become "moved". */
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
  /** First position at or after `value`. */
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

  /** Resolves one pair; true if it actually pushed, which drives chain propagation. */
  const resolvePair = (i: number, j: number): boolean => {
    const a = nodes[i];
    const b = nodes[j];
    const minDist = (a.r + b.r) * ratio;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    if (dist >= minDist) return false;
    if (dist < 1e-6) {
      // Identical coordinates — pick an axis deterministically (push horizontally).
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
      // Nothing to look at when this node and every candidate are stationary.
      // An active `i` scans all `j`; an inactive one scans only active `j` —
      // either way the set of pairs is the same. `iActive` is read once *before*
      // the j loop, so an `i` that becomes active mid-loop does not change this
      // pass's enumeration.
      const iActive = active === null || active[i];
      if (iActive) {
        for (let j = i + 1; j < n; j += 1) {
          if (!resolvePair(i, j)) continue;
          // **Chain propagation** — a pushed stationary node has now moved, and
          // the next iteration must see whom it pushes in turn, or A→B→C never
          // resolves. Drop this and the loop gets faster but leaves overlaps.
          enlist(i);
          enlist(j);
        }
      } else if (activeIdx !== null) {
        // Active `j` only, ascending. The only node newly activated on this
        // path is `i` itself (each `j` is active already), and enlisting `i` now
        // would shift the cursor below — so it is enlisted after the j loop.
        // Per the note above this does not affect the pass's enumeration, so
        // behaviour is unchanged.
        let selfMoved = false;
        for (let p = lowerBound(activeIdx, i + 1); p < activeIdx.length; p += 1) {
          if (resolvePair(i, activeIdx[p])) selfMoved = true;
        }
        if (selfMoved) enlist(i);
      }
    }
  }
}
