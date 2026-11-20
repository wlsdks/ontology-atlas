import { seedAngle } from "./seed";

/** The neighbour list's skin, as a share of the median padded body diameter. */
const SEPARATION_SKIN = 0.5;
/** Bodies from which a neighbour list beats testing every pair in each separation round. */
const NEIGHBOUR_LIST_FROM = 96;

export interface Body { id: string; x: number; y: number; r: number; fixed: boolean }

/** Each body's later neighbours, ascending: `to[start[i]..start[i + 1])`. */
interface NeighbourList { start: Int32Array; to: Int32Array }

/**
 * For each body, the later bodies within `reach` of touching it; fixed pairs are left out. A sweep
 * over x, then a sort of the pair keys: O(n log n + x-overlapping pairs + listed pairs · log).
 */
function neighbourList(bodies: readonly Body[], gap: number, reach: number): NeighbourList {
  const n = bodies.length;
  const byLeft = Array.from({ length: n }, (_, i) => i).sort((a, b) => bodies[a]!.x - bodies[a]!.r - (bodies[b]!.x - bodies[b]!.r));
  const keys: number[] = [];
  for (let s = 0; s < n; s += 1) {
    const i = byLeft[s]!;
    const p = bodies[i]!;
    const right = p.x + p.r + gap + reach;
    for (let t = s + 1; t < n; t += 1) {
      const j = byLeft[t]!;
      const q = bodies[j]!;
      if (q.x - q.r >= right) break;
      if (p.fixed && q.fixed) continue;
      const near = p.r + q.r + gap + reach;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy < near * near) keys.push(i < j ? i * n + j : j * n + i);
    }
  }
  const sorted = Float64Array.from(keys).sort();
  const start = new Int32Array(n + 1);
  const to = new Int32Array(sorted.length);
  for (let k = 0; k < sorted.length; k += 1) {
    start[Math.floor(sorted[k]! / n) + 1]! += 1;
    to[k] = sorted[k]! % n;
  }
  for (let i = 0; i < n; i += 1) start[i + 1]! += start[i]!;
  return { start, to };
}

/** Pushes two bodies apart until they keep `gap`, a fixed one never moving; reports whether they overlapped. */
function pushApart(p: Body, q: Body, gap: number): boolean {
  const need = p.r + q.r + gap;
  let dx = q.x - p.x;
  let dy = q.y - p.y;
  const squared = dx * dx + dy * dy;
  if (squared >= need * need) return false;
  let d = Math.sqrt(squared);
  if (d < 1e-6) {
    const a = seedAngle(`${p.id}|${q.id}`);
    dx = Math.cos(a);
    dy = Math.sin(a);
    d = 1;
  }
  const push = need - d;
  const ux = dx / d;
  const uy = dy / d;
  const pShare = p.fixed ? 0 : q.fixed ? 1 : 0.5;
  const qShare = 1 - pShare;
  p.x -= ux * push * pShare;
  p.y -= uy * push * pShare;
  q.x += ux * push * qShare;
  q.y += uy * push * qShare;
  return true;
}

/**
 * Pairwise separation in index order; fixed bodies never move. Below `NEIGHBOUR_LIST_FROM` bodies
 * every pair is tested, O(rounds · n²); above it a round tests a neighbour list, see `separateNear`.
 */
export function separate(bodies: Body[], gap: number, rounds: number): void {
  const n = bodies.length;
  if (n >= NEIGHBOUR_LIST_FROM) {
    separateNear(bodies, gap, rounds);
    return;
  }
  for (let round = 0; round < rounds; round += 1) {
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      const p = bodies[i]!;
      for (let j = i + 1; j < n; j += 1) {
        const q = bodies[j]!;
        if (p.fixed && q.fixed) continue;
        if (pushApart(p, q, gap)) moved = true;
      }
    }
    if (!moved) return;
  }
}

/**
 * Separation over a neighbour list with a skin, rebuilt when a body has drifted half the skin, so a
 * round that moves nothing has tested every overlapping pair. O(rounds · n + rebuilds · n log n + listed pairs).
 */
function separateNear(bodies: Body[], gap: number, rounds: number): void {
  const n = bodies.length;
  const skin = SEPARATION_SKIN * bodies.map((b) => 2 * b.r + gap).sort((a, b) => a - b)[n >> 1]!;
  const limit = (skin / 2) ** 2;
  const builtX = new Float64Array(n);
  const builtY = new Float64Array(n);
  let list: NeighbourList | null = null;
  for (let round = 0; round < rounds; round += 1) {
    let drifted = list === null;
    for (let k = 0; k < n && !drifted; k += 1) {
      const dx = bodies[k]!.x - builtX[k]!;
      const dy = bodies[k]!.y - builtY[k]!;
      drifted = dx * dx + dy * dy > limit;
    }
    if (drifted) {
      list = neighbourList(bodies, gap, skin);
      for (let k = 0; k < n; k += 1) {
        builtX[k] = bodies[k]!.x;
        builtY[k] = bodies[k]!.y;
      }
    }
    const { start, to } = list!;
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      for (let e = start[i]!; e < start[i + 1]!; e += 1) if (pushApart(bodies[i]!, bodies[to[e]!]!, gap)) moved = true;
    }
    if (!moved) return;
  }
}
