/**
 * A Barnes–Hut quadtree for the library graph's many-body force — **written here, not
 * imported**.
 *
 * The repository takes no new dependency for a renderer or a layout
 * (`docs/DECISIONS.md`, 2026-08-18 (78), rejection 3), and Graphology's own quadtree is
 * private to ForceAtlas2's `assign` pass: it cannot be borrowed for a loop that has to
 * step one frame at a time and let a person drag a node in the middle of it. So it is
 * about 120 lines of arithmetic here rather than a package.
 *
 * ## What it buys, measured
 *
 * The exact pass is O(n²) per tick and the approximated one O(n log n) with a tree to
 * build first, so the tree loses on small graphs and the crossover is a number, not a
 * preference. Measured on an M-series laptop, one whole tick, mean of 30 (2026-09-07):
 *
 * | Nodes | Exact many-body | Barnes–Hut (θ = 0.85) |
 * |---|---|---|
 * | 500 | 0.95 ms | 1.15 ms |
 * | 700 | 1.54 ms | 1.56 ms |
 * | 800 | 1.97 ms | 1.73 ms |
 * | 3000 | 20.8 ms | 8.5 ms |
 *
 * `MANY_BODY_EXACT_MAX_ORDER` in `library-force-simulation.ts` pins the switch at 720,
 * just past the crossing; `library-force-simulation.perf.test.ts` re-measures both passes
 * **on the same graph** and fails if that ordering inverts.
 *
 * ## θ
 *
 * A cell is treated as one mass when its width divided by the distance to it is below
 * θ. 0.85 is the loosest value at which the approximated layout was still visually the
 * exact one on the folders measured here; 1.2 started to smear clusters that the exact
 * pass separated, and 0.5 cost most of the speed the tree was built for.
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

/**
 * The tree, plus the one operation the simulation needs from it.
 *
 * It is rebuilt every tick rather than updated in place: positions move on every node on
 * every tick, so an incremental tree would re-insert everything anyway and carry the
 * bookkeeping as well.
 */
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
    // An empty or degenerate cloud still needs a square to live in; 1 is enough, because
    // every insert below widens nothing — points outside the root are clamped by the
    // caller's own bounds, which is where these numbers came from.
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
    // 24 levels is a cell 16 million times smaller than the root. Below that two points
    // are the same point for every purpose this force has, and recursing further on a
    // genuine duplicate would not terminate.
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
      // The cell was a leaf carrying one point; it becomes internal and both points go
      // down. `leafCount` may be more than one when duplicates piled up at the depth cap.
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

  /**
   * Accumulates the repulsion every other point exerts on `(x, y)` into `out`.
   *
   * `strength` is negative for repulsion, exactly as `d3-force`'s many-body charge is, so
   * the sign convention is the one anybody reading force code already knows.
   */
  accumulate(
    x: number,
    y: number,
    strength: number,
    out: { fx: number; fy: number },
  ): void {
    this.walk(this.root, x, y, strength, out);
  }

  private walk(
    cell: QuadNode,
    x: number,
    y: number,
    strength: number,
    out: { fx: number; fy: number },
  ): void {
    if (cell.mass === 0) return;
    const dx = cell.x - x;
    const dy = cell.y - y;
    const distanceSquared = dx * dx + dy * dy;
    if (cell.children === null) {
      if (distanceSquared < 1e-9) {
        // The leaf holds the point being solved for. On its own it contributes nothing,
        // and its zero distance would divide by zero; genuine duplicates sitting on the
        // same coordinates are pushed apart along a **fixed** diagonal rather than a
        // random one, so the same folder separates the same way on every machine.
        const others = cell.mass - 1;
        if (others <= 0) return;
        const weight = (strength * others) / 2e-6;
        out.fx += 1e-3 * weight;
        out.fy += 1e-3 * weight;
        return;
      }
      const weight = (strength * cell.mass) / distanceSquared;
      out.fx += dx * weight;
      out.fy += dy * weight;
      return;
    }
    if (distanceSquared > 1e-9 && (cell.half * 2) / Math.sqrt(distanceSquared) < BARNES_HUT_THETA) {
      const weight = (strength * cell.mass) / distanceSquared;
      out.fx += dx * weight;
      out.fy += dy * weight;
      return;
    }
    for (const child of cell.children) this.walk(child, x, y, strength, out);
  }
}

function quadrantOf(cell: QuadNode, x: number, y: number): 0 | 1 | 2 | 3 {
  const right = x >= cell.cx ? 1 : 0;
  const below = y >= cell.cy ? 2 : 0;
  return (right + below) as 0 | 1 | 2 | 3;
}
