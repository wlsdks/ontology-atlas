/**
 * Footprint step numbers — turns a visit array into per-node step numbers.
 *
 * Replaces the old `footprint-ring.ts` (concentric hairline rings + a recency
 * rank). Why the rings went is in `render/footprint-glyph.ts`'s header; **why the
 * rank went** belongs here: rank answered "how recently was this visited", so a
 * node had exactly one, leaving nowhere to express a step the walker retraced. A
 * step answers "which step along the path", so a revisit naturally has several.
 *
 * Pure functions only — no canvas or React knowledge.
 */

/**
 * Per-node **list of visit numbers** — `["a","b","a"]` → `{a:[1,3], b:[2]}`.
 * Counted from 1, because the number is shown on screen and 0-based would be
 * misread.
 *
 * The number is a position within the trail array, so when the cap truncates the
 * front the remaining steps renumber from 1: "which step along the path you can
 * currently see" is the only question the user can answer. Preserving the numbers
 * of truncated steps would produce a list with no 1 in it.
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

/** Both endpoint ids → a lookup key, sorted so direction does not matter (edges are looked up undirected). */
export function walkedEdgeKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/**
 * Key set of **consecutively visited pairs** in the trail — decides which relation
 * lines get a mark beside them.
 *
 * Two consecutively visited nodes **may have no actual relation between them**, so
 * this set is only a candidate list and the draw side applies it to real edges
 * only. Marking a line that does not exist would break the contract that a line
 * means a relation.
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
