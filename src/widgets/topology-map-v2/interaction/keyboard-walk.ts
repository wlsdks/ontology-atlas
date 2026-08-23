/**
 * **Walking the graph with the arrow keys** — option B (owner call, 2026-08-09).
 *
 * The arrow keys do not move the camera; they **move the focus to a neighbour**.
 * The camera follows only when the focus is about to leave the screen. This file
 * holds only the pure functions deciding «which neighbour» — it knows nothing of
 * the canvas or React.
 *
 * ## Why projection plus an orthogonal penalty rather than an angle
 *
 * What «the neighbour above» means is not self-evident. With nodes ringed around,
 * what a person calls «up» can differ from whatever has the smallest angle.
 *
 * So it uses what TV remotes and CSS spatial navigation use:
 *
 * 1. If the **projection** onto the pressed direction (how far it went that way)
 *    is 0 or less, it is **behind** and is discarded.
 * 2. Among the rest, take the smallest **projection + orthogonal distance ×
 *    penalty**.
 *
 * The orthogonal penalty is what stops a node that is «almost beside you, slightly
 * above» from beating the one «directly above». With distance alone, the arrow
 * keys feel unrelated to direction.
 *
 * ## Why a cone — and why ±60°
 *
 * Filtering by projection alone catches **a node almost exactly to the side as
 * "up"** (any projection above zero passes). Then pressing up moves sideways, and
 * the user stops trusting the arrow keys.
 *
 * Narrowing to ±45° leaves many neighbours unreachable in this graph — the nodes
 * sit where physics spread them, not on a grid. ±60° is the narrowest angle whose
 * four directions **cover the plane with no gap** (4 × 120° = 360°). Narrower and
 * some neighbours are reachable by no arrow key; wider and two directions fight
 * over the same neighbour.
 *
 * ⚠️ **With nothing there it does nothing — it does not wrap around.** Jumping to
 * the opposite side when that direction has no neighbour loses the user's sense of
 * where they are. Here, "nothing happens" is the honest response.
 */

export type WalkDirection = 'up' | 'down' | 'left' | 'right';

export interface WalkNode {
  readonly id: string;
  readonly x: number;
  /** Screen coordinates — **y grows downward** (canvas convention). `up` is the direction y decreases. */
  readonly y: number;
}

/** The penalty applied to orthogonal distance. At 1 it ties with straight ahead at 45°. */
export const ORTHOGONAL_PENALTY = 2;

/**
 * The tangent of the cone's half angle — ±60° (`Math.tan(Math.PI / 3)`).
 *
 * Frozen as a constant because computing the angle per call adds cost wherever this
 * function lands on a per-frame path, and because this value is the specification
 * and so has to be decided in one place.
 */
export const CONE_HALF_TANGENT = Math.tan(Math.PI / 3);

const AXIS: Record<WalkDirection, { readonly dx: number; readonly dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * The most «natural» neighbour in that direction, or `null` if there is none.
 *
 * `neighbors` may contain `from` itself — its projection is 0, so it is filtered out.
 */
export function pickNeighborInDirection(
  from: WalkNode,
  neighbors: readonly WalkNode[],
  direction: WalkDirection,
): string | null {
  const axis = AXIS[direction];
  let bestId: string | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const node of neighbors) {
    if (node.id === from.id) continue;
    const dx = node.x - from.x;
    const dy = node.y - from.y;

    // How far along the pressed direction, and how far off it at a right angle.
    const along = dx * axis.dx + dy * axis.dy;
    if (along <= 0) continue; // Behind, or exactly to the side.
    const across = Math.abs(dx * axis.dy - dy * axis.dx);
    if (across > along * CONE_HALF_TANGENT) continue; // Outside the cone.

    const cost = along + across * ORTHOGONAL_PENALTY;
    // On a tie, take **the lower id** — the same input has to give the same result
    // every time, and relying on array order makes the result shift whenever the
    // layout does.
    if (cost < bestCost || (cost === bestCost && bestId !== null && node.id < bestId)) {
      bestCost = cost;
      bestId = node.id;
    }
  }

  return bestId;
}

/**
 * The node to grab first when there is no focus — **the one nearest the screen
 * centre**.
 *
 * Picking «the first node» by array order can land off screen, and then pressing an
 * arrow key shows no visible change (the camera does follow, but the user cannot
 * tell what happened). Starting from what they are looking at is always right.
 */
export function pickInitialFocus(
  nodes: readonly WalkNode[],
  viewportCenter: { readonly x: number; readonly y: number },
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const dx = node.x - viewportCenter.x;
    const dy = node.y - viewportCenter.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance || (distance === bestDistance && bestId !== null && node.id < bestId)) {
      bestDistance = distance;
      bestId = node.id;
    }
  }
  return bestId;
}

/**
 * **How often to say "dead end"** — so the same notice is not poured out repeatedly.
 *
 * ⚠️ At first, a direction with no neighbour did **nothing**. The "no wrapping"
 * judgement was right (jumping to the opposite side loses the user's position), but
 * **the silence was the problem**: after actually using it the owner said
 * "The arrow keys work, but I can't move freely between nodes". With no response to a press, the user cannot
 * tell «broken» from «nothing in that direction» — the same failure this repository
 * named "The Silent Wait".
 *
 * So the constraint stays and **it speaks**. But holding an arrow key would stack up
 * dozens of identical notices, so after saying it once it stays quiet for a while.
 *
 * Why measured in time: blocking only on «the same direction repeated» doubles the
 * flood when alternating left and right. The test is **«did I just say it»**, not
 * «what was pressed».
 */
export const DEAD_END_NOTICE_COOLDOWN_MS = 1200;

/** May the dead end be announced now? A `null` `lastAtMs` means it has never been said. */
export function shouldAnnounceDeadEnd(lastAtMs: number | null, nowMs: number): boolean {
  if (lastAtMs === null) return true;
  return nowMs - lastAtMs >= DEAD_END_NOTICE_COOLDOWN_MS;
}

/** Arrow key name → our direction. Any other key is `null` (not ours). */
export function walkDirectionForKey(key: string): WalkDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}
