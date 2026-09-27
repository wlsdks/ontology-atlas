/**
 * A Barnes–Hut quadtree for the many-body force, written here because the repository takes
 * no new layout dependency (`docs/DECISIONS.md` (78)) and Graphology's is private to
 * ForceAtlas2. Build O(n log n), query O(log n) per point, so a tick is O(n log n) against
 * the exact O(n²); `MANY_BODY_EXACT_MAX_ORDER` sets the measured crossover.
 *
 * θ = 0.85 is the loosest value that still matched the exact layout visually; 1.2 smeared
 * clusters and 0.5 lost most of the speed.
 */

const BARNES_HUT_THETA = 0.85;

interface QuadNode {
  /** Total charge in this cell — node count, since every node carries the same charge. */
  mass: number;
  /** Centre of mass. */
  x: number;
  y: number;
  /** Half-width of the square this cell covers. */
  half: number;
  /** Cell centre, which is not the centre of mass. */
  cx: number;
  cy: number;
  /** The four children, or null while this is a leaf. */
  children: [QuadNode, QuadNode, QuadNode, QuadNode] | null;
  /** A leaf's single point, kept so the first insert does not have to subdivide. */
  leafX: number;
  leafY: number;
  /** How many points sit at exactly the same coordinates. Stops infinite subdivision. */
  leafCount: number;
}

function makeCell(cx: number, cy: number, half: number): QuadNode {
  return { mass: 0, x: 0, y: 0, half, cx, cy, children: null, leafX: 0, leafY: 0, leafCount: 0 };
}

export interface QuadtreePoint {
  x: number;
  y: number;
}

/** Rebuilt every tick, since every node moves every tick and an incremental tree would re-insert everything. */
export class LibraryQuadtree {
  private readonly root: QuadNode;

  constructor(points: readonly QuadtreePoint[]) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
    // A degenerate cloud still needs a square; the root spans the caller's own bounds.
    if (!Number.isFinite(minX)) {
      minX = -1;
      minY = -1;
      maxX = 1;
      maxY = 1;
    }
    const half = Math.max(1, Math.max(maxX - minX, maxY - minY) / 2) * 1.05;
    this.root = makeCell((minX + maxX) / 2, (minY + maxY) / 2, half);
    for (const point of points) this.insert(this.root, point.x, point.y, 0);
  }

  private insert(cell: QuadNode, x: number, y: number, depth: number): void {
    // Depth cap: below 24 levels two points are the same point, and a duplicate would recurse forever.
    if (depth > 24 || (cell.children === null && cell.leafCount === 0)) {
      cell.leafX = x;
      cell.leafY = y;
      cell.leafCount += 1;
      cell.mass += 1;
      cell.x += (x - cell.x) / cell.mass;
      cell.y += (y - cell.y) / cell.mass;
      return;
    }
    if (cell.children === null) {
      // A leaf splits and both points go down; `leafCount` exceeds one only for duplicates at the cap.
      const heldX = cell.leafX;
      const heldY = cell.leafY;
      const held = cell.leafCount;
      cell.leafCount = 0;
      cell.children = [
        makeCell(cell.cx - cell.half / 2, cell.cy - cell.half / 2, cell.half / 2),
        makeCell(cell.cx + cell.half / 2, cell.cy - cell.half / 2, cell.half / 2),
        makeCell(cell.cx - cell.half / 2, cell.cy + cell.half / 2, cell.half / 2),
        makeCell(cell.cx + cell.half / 2, cell.cy + cell.half / 2, cell.half / 2),
      ];
      for (let index = 0; index < held; index += 1) {
        this.insert(cell.children[quadrantOf(cell, heldX, heldY)], heldX, heldY, depth + 1);
      }
    }
    cell.mass += 1;
    cell.x += (x - cell.x) / cell.mass;
    cell.y += (y - cell.y) / cell.mass;
    this.insert(cell.children[quadrantOf(cell, x, y)], x, y, depth + 1);
  }

  /** Accumulates every other point's repulsion on `(x, y)` into `out`; negative `strength` repels (`d3-force`). */
  accumulate(
    x: number,
    y: number,
    strength: number,
    out: { fx: number; fy: number },
    maxDistance = Infinity,
  ): void {
    this.walk(this.root, x, y, strength, out, maxDistance * maxDistance);
  }

  private walk(
    cell: QuadNode,
    x: number,
    y: number,
    strength: number,
    out: { fx: number; fy: number },
    maxDistanceSquared: number,
  ): void {
    if (cell.mass === 0) return;
    const dx = cell.x - x;
    const dy = cell.y - y;
    const distanceSquared = dx * dx + dy * dy;
    // A cell whose nearest corner is past the cutoff is skipped whole.
    if (distanceSquared > maxDistanceSquared) {
      const nearest = Math.max(0, Math.sqrt(distanceSquared) - cell.half * Math.SQRT2);
      if (nearest * nearest > maxDistanceSquared) return;
    }
    if (cell.children === null) {
      if (distanceSquared < 1e-9) {
        // The point itself contributes nothing (a zero distance); true duplicates separate
        // along a fixed diagonal, so the result is deterministic.
        const others = cell.mass - 1;
        if (others <= 0) return;
        const weight = (strength * others) / 2e-6;
        out.fx += 1e-3 * weight;
        out.fy += 1e-3 * weight;
        return;
      }
      if (distanceSquared > maxDistanceSquared) return;
      const weight = (strength * cell.mass) / distanceSquared;
      out.fx += dx * weight;
      out.fy += dy * weight;
      return;
    }
    if (distanceSquared > 1e-9 && (cell.half * 2) / Math.sqrt(distanceSquared) < BARNES_HUT_THETA) {
      if (distanceSquared > maxDistanceSquared) return;
      const weight = (strength * cell.mass) / distanceSquared;
      out.fx += dx * weight;
      out.fy += dy * weight;
      return;
    }
    for (const child of cell.children) this.walk(child, x, y, strength, out, maxDistanceSquared);
  }
}

function quadrantOf(cell: QuadNode, x: number, y: number): 0 | 1 | 2 | 3 {
  const right = x >= cell.cx ? 1 : 0;
  const below = y >= cell.cy ? 2 : 0;
  return (right + below) as 0 | 1 | 2 | 3;
}
