/**
 * Flat-top hexagon maths in axial `(q, r)` unit space (circumradius 1), so the board is
 * laid out once and drawn at any cell size R. Centre `x = 1.5q`, `y = √3(r + q/2)`; corner
 * `i` at `i·60°` (y down); distance `max(|dq|, |dr|, |dq+dr|)`.
 */

export type Axial = readonly [number, number];

export const SQRT3 = Math.sqrt(3);

export const HEX_NEIGHBORS: readonly Axial[] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

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

export function axialToUnit(q: number, r: number): { x: number; y: number } {
  return { x: 1.5 * q, y: SQRT3 * (r + q / 2) };
}

/** Cube rounding. */
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
  // Normalise -0 so keys never split one cell in two.
  return [rx + 0, rz + 0];
}

export function unitToAxial(x: number, y: number): [number, number] {
  const q = x / 1.5;
  const r = y / SQRT3 - q / 2;
  return axialRound(q, r);
}

/**
 * Ring `k` starts at `(-k, k)` and walks six sides. The order never depends on `count`, so
 * a new domain takes the next slot without moving an earlier one.
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

/** Round a centre that is itself taken. */
export function ringsFor(n: number): number {
  let k = 0;
  let cells = 1;
  while (cells < n + 1) {
    k += 1;
    cells += 6 * k;
  }
  return k;
}

/** `radius − |dy|/√3`, since the corners sit on the horizontal axis. */
export function hexHalfWidthAt(radius: number, dy: number): number {
  return radius - Math.abs(dy) / SQRT3;
}

export function insideHex(dx: number, dy: number, radius: number): boolean {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const apothem = (radius * SQRT3) / 2;
  if (ay > apothem) return false;
  return ax <= hexHalfWidthAt(radius, ay);
}
