/**
 * Flat-top hexagon maths for the **hex board** (`model/hex-board.ts`), in axial `(q, r)`
 * coordinates. Everything here is in *unit* space — a cell's circumradius is 1 — so the board
 * is laid out once and drawn at any cell size by multiplying by `R`.
 *
 * - Centre: `x = 1.5q`, `y = √3(r + q/2)`.
 * - Corner `i` sits at angle `i·60°` (y down). Edge `i` runs from corner `i` to corner `i+1`,
 *   and the neighbour across it is `HEX_NEIGHBORS[i]`.
 * - Distance: `max(|dq|, |dr|, |dq+dr|)`.
 */

export type Axial = readonly [number, number];

export const SQRT3 = Math.sqrt(3);

/** The neighbour across edge `i` (corners `i` and `i+1`). */
export const HEX_NEIGHBORS: readonly Axial[] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/** Walking order round a ring, used by the spiral. */
const RING_STEPS: readonly Axial[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export const hexKey = (q: number, r: number): string => `${q},${r}`;

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Centre of a cell in unit space. */
export function axialToUnit(q: number, r: number): { x: number; y: number } {
  return { x: 1.5 * q, y: SQRT3 * (r + q / 2) };
}

/** Nearest cell to fractional axial coordinates (cube rounding). */
export function axialRound(q: number, r: number): [number, number] {
  const x = q;
  const z = r;
  const y = -x - z;
  let rx = Math.round(x);
  const ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  // Recompute whichever component rounded furthest; when that is y, q and r already stand.
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dz >= dy) rz = -rx - ry;
  // Normalise -0 so keys and equality never split one cell in two.
  return [rx + 0, rz + 0];
}

/** The cell under a unit-space point. */
export function unitToAxial(x: number, y: number): [number, number] {
  const q = x / 1.5;
  const r = y / SQRT3 - q / 2;
  return axialRound(q, r);
}

/**
 * The first `count` cells of a hex spiral about the origin, the origin first. Ring `k` starts
 * at `(-k, k)` and walks the six sides; the order never depends on `count`, so the i-th slot is
 * the same cell however many are asked for — which is what lets a new domain take "the next
 * slot" without moving any earlier one.
 */
export function hexSpiral(count: number): Axial[] {
  const out: Axial[] = [[0, 0]];
  for (let ring = 1; out.length < count; ring += 1) {
    let q = -ring;
    let r = ring;
    for (let side = 0; side < 6; side += 1) {
      for (let step = 0; step < ring; step += 1) {
        out.push([q, r]);
        q += RING_STEPS[side]![0];
        r += RING_STEPS[side]![1];
      }
    }
  }
  return out.slice(0, count);
}

/** Rings needed to hold `n` cells round a centre that is itself taken. */
export function ringsFor(n: number): number {
  let k = 0;
  let cells = 1;
  while (cells < n + 1) {
    k += 1;
    cells += 6 * k;
  }
  return k;
}

/**
 * Half the width of a flat-top hexagon of circumradius `radius` at a vertical offset `dy` from
 * its centre: `radius − |dy|/√3` (the corners sit on the horizontal axis).
 */
export function hexHalfWidthAt(radius: number, dy: number): number {
  return radius - Math.abs(dy) / SQRT3;
}

/** Whether a point lies inside a flat-top hexagon of circumradius `radius` centred at the origin. */
export function insideHex(dx: number, dy: number, radius: number): boolean {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const apothem = (radius * SQRT3) / 2;
  if (ay > apothem) return false;
  return ax <= hexHalfWidthAt(radius, ay);
}
