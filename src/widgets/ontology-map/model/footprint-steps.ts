/**
 * A step number answers "which step along the path", so a revisited node carries several;
 * a recency rank could not express a retraced step.
 */

/**
 * `["a","b","a"]` → `{a:[1,3], b:[2]}`, counted from 1 because it is shown. Positions are
 * in the current trail, so a capped trail renumbers from 1 rather than showing no 1.
 */
export function buildFootprintSteps(trail: readonly string[]): Map<string, number[]> {
  const steps = new Map<string, number[]>();
  trail.forEach((id, i) => {
    const list = steps.get(id);
    if (list) list.push(i + 1);
    else steps.set(id, [i + 1]);
  });
  return steps;
}

/** Sorted, since edges are looked up undirected. */
export function walkedEdgeKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/**
 * Consecutive visits may have no relation between them, so this is a candidate list the
 * draw applies to real edges only; a mark on a missing line would break "a line is a relation".
 */
export function buildWalkedEdgeKeys(trail: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a === b) continue;
    keys.add(walkedEdgeKey(a, b));
  }
  return keys;
}

/**
 * A line belongs to the star it leads to, so the ignition sweep draws the path in the
 * order it happened.
 */
export function buildWalkedEdgeArrivalSteps(trail: readonly string[]): Map<string, number> {
  const steps = new Map<string, number>();
  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a === b) continue;
    // A relation walked twice arrives at its first crossing: the path is drawn once, in order.
    const key = walkedEdgeKey(a, b);
    if (!steps.has(key)) steps.set(key, i);
  }
  return steps;
}

/**
 * `true` when walked from the lower id to the higher. The star mark cannot carry a heading,
 * so this is the only record of direction. A relation walked both ways keeps the last
 * crossing, the way the person most recently went.
 */
export function buildWalkedEdgeDirections(trail: readonly string[]): Map<string, boolean> {
  const directions = new Map<string, boolean>();
  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a === b) continue;
    directions.set(walkedEdgeKey(a, b), a < b);
  }
  return directions;
}

export interface TrailGlintLeg {
  start: number;
  end: number;
}

/**
 * Each relation gets a slice of the lap proportional to its length, so one light walks the
 * path in order at one speed; one shared clock per line would move lights seen together at
 * different speeds. World-space chords suffice, since the camera scales every edge alike.
 */
export function buildTrailGlintLegs(
  legs: readonly { key: string; length: number }[],
): Map<string, TrailGlintLeg> {
  const out = new Map<string, TrailGlintLeg>();
  let total = 0;
  for (const leg of legs) total += Number.isFinite(leg.length) && leg.length > 0 ? leg.length : 0;
  if (total <= 0) {
    // A walk whose stops share one point gets equal slices rather than a division by zero.
    const share = legs.length > 0 ? 1 / legs.length : 0;
    legs.forEach((leg, i) => out.set(leg.key, { start: i * share, end: (i + 1) * share }));
    return out;
  }
  let cursor = 0;
  for (const leg of legs) {
    const share = (Number.isFinite(leg.length) && leg.length > 0 ? leg.length : 0) / total;
    out.set(leg.key, { start: cursor, end: cursor + share });
    cursor += share;
  }
  return out;
}

/**
 * The lap position rewritten in the relation's own coordinates, or `null` elsewhere, so
 * the caller's `a → b` interpolation is unchanged.
 */
export function trailGlintLocalPhase(leg: TrailGlintLeg | undefined, lapPhase: number): number | null {
  if (leg === undefined) return null;
  const span = leg.end - leg.start;
  if (span <= 0) return null;
  const local = (lapPhase - leg.start) / span;
  return local < 0 || local > 1 ? null : local;
}
