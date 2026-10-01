export interface Point {
  x: number;
  y: number;
}

export type RevealEnd = "a" | "b";

export interface EdgeReveal {
  progress: number;
  from: RevealEnd;
  baseLift: number;
}

const REVEAL_DONE = 0.995;

function lerp(p: Point, q: Point, t: number): Point {
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

export function partialQuadratic(
  a: Point,
  c: Point,
  b: Point,
  t: number,
  from: RevealEnd,
): { a: Point; control: Point; b: Point } {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  if (from === "a") {
    const ac = lerp(a, c, k);
    return { a, control: ac, b: lerp(ac, lerp(c, b, k), k) };
  }
  const s = 1 - k;
  const cb = lerp(c, b, s);
  return { a: lerp(lerp(a, c, s), cb, s), control: cb, b };
}

export function revealEnd(directional: boolean, sourceId: string, attendedId: string | null): RevealEnd {
  return directional || sourceId === attendedId ? "a" : "b";
}

export function edgeRevealProgress(egoReveal: number, reducedMotion: boolean): number {
  if (reducedMotion || !(egoReveal < REVEAL_DONE)) return 1;
  const r = egoReveal > 0 ? egoReveal : 0;
  return r * r * (3 - 2 * r);
}

export function revealSpan(reveal: EdgeReveal): { lo: number; hi: number } {
  return reveal.from === "a" ? { lo: 0, hi: reveal.progress } : { lo: 1 - reveal.progress, hi: 1 };
}
