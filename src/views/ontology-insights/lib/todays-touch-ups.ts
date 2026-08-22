import type { DoNextQueue } from "./do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "./dependency-cycles";

/**
 * "Today's touch-ups" — the band at the top of the to-do tab. It creates no new surface and no new
 * algorithm; it truncates the top three from the already-computed do-next queue and dependency
 * cycles. Priority reuses the existing rankings:
 *
 *   1. Forced review — dependency cycles (a loop structurally waiting on itself; the most urgent,
 *      and already rendered with a warning icon).
 *   2. Top neglected hubs — the do-next queue's neglected-hub rows (already ordered by degree ×
 *      days idle).
 *   3. Promotion candidates — the do-next queue's promotion rows.
 *
 * Orphans are not band material (this is a truncation of "worth doing now", so it holds only the
 * axis where connecting is urgent) — they remain in the full queue.
 *
 * Cold-start guard: on a small vault (day one), or when three items cannot be filled, it returns an
 * empty array and the band is not rendered at all (no empty band on the first screen).
 */

export type TouchUpReason =
  | { kind: "cycle"; length: number }
  | { kind: "neglected-hub"; degree: number; agoDays: number }
  /** fanIn = the incoming reference count — evidence the queue row already carries (lumping it as
   *  "several places" made three rows repeat one phrase, measured 2026-08-13). */
  | { kind: "promotion"; fanIn: number };

export interface TouchUpItem {
  /** The band row's unique id — also the key for marking session completion. */
  id: string;
  source: "cycle" | "neglected-hub" | "promotion";
  /** The deeplink target for the map and the builder (a graph node id). */
  nodeId: string;
  title: string;
  /** For the kind glyph. A cycle row has no kind, hence "". */
  nodeKind: string;
  reason: TouchUpReason;
  /** The per-row agent handoff, for copying — it reuses the queue row and cycle handoffs. */
  handoffPayload: string;
}

export interface PickTouchUpsOptions {
  /** The total node count — used by the cold-start guard. */
  totalNodes: number;
  /** How many items the band holds. Defaults to TOUCH_UP_TARGET (3). */
  limit?: number;
  /** Below this, the vault counts as small and the band is not shown. Defaults to TOUCH_UP_MIN_VAULT_NODES (12). */
  minVaultNodes?: number;
  /** A cycle's first node id → display title. */
  cycleTitle: (nodeId: string) => string;
  /** The per-cycle agent handoff payload. */
  cycleHandoff: (cycle: DependencyCycle) => string;
  /**
   * The exact row id currently under review. When present, the band is kept even with only one or
   * two items, and if the signal is still alive it is lifted to the first row.
   */
  reviewId?: string | null;
}

export const TOUCH_UP_TARGET = 3;
export const TOUCH_UP_MIN_VAULT_NODES = 12;

export function pickTodaysTouchUps(
  queue: DoNextQueue,
  cycles: DependencyCyclesResult,
  options: PickTouchUpsOptions,
): TouchUpItem[] {
  const limit = options.limit ?? TOUCH_UP_TARGET;
  const minVaultNodes = options.minVaultNodes ?? TOUCH_UP_MIN_VAULT_NODES;

  // Cold-start guard: a small vault (day one) shows no band.
  if (options.totalNodes < minVaultNodes) return [];

  const forcedReview: TouchUpItem[] = cycles.cycles.map((cycle) => {
    const firstNodeId = cycle.nodeIds[0];
    return {
      id: `cycle:${cycle.id}`,
      source: "cycle",
      nodeId: firstNodeId,
      title: options.cycleTitle(firstNodeId),
      nodeKind: "",
      reason: { kind: "cycle", length: cycle.length },
      handoffPayload: options.cycleHandoff(cycle),
    };
  });

  const neglectedHub: TouchUpItem[] = queue.rows
    .filter((row) => row.rowKind === "neglected-hub")
    .map((row) => ({
      id: `neglected-hub:${row.nodeId}`,
      source: "neglected-hub" as const,
      nodeId: row.nodeId,
      title: row.title,
      nodeKind: row.nodeKind,
      reason: { kind: "neglected-hub" as const, degree: row.degree ?? 0, agoDays: row.agoDays ?? 0 },
      handoffPayload: row.handoffPayload,
    }));

  const promotion: TouchUpItem[] = queue.rows
    .filter((row) => row.rowKind === "promotion")
    .map((row) => ({
      id: `promotion:${row.nodeId}`,
      source: "promotion" as const,
      nodeId: row.nodeId,
      title: row.title,
      nodeKind: row.nodeKind,
      reason: { kind: "promotion" as const, fanIn: row.degree ?? 0 },
      handoffPayload: row.handoffPayload,
    }));

  const ordered = [...forcedReview, ...neglectedHub, ...promotion];
  const activeReviewIndex = options.reviewId
    ? ordered.findIndex((item) => item.id === options.reviewId)
    : -1;
  if (activeReviewIndex > 0) {
    const [activeReview] = ordered.splice(activeReviewIndex, 1);
    ordered.unshift(activeReview);
  }

  // During a review round trip the next action is not lost even when only one or two signals remain.
  // Otherwise the existing cold-start guard holds (no band below the target count).
  if (!options.reviewId && ordered.length < limit) return [];
  return ordered.slice(0, limit);
}
