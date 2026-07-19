/**
 * W6 agent visibility — pure decision for the map's transient "N concepts
 * updated" chip (`ui/TopologyChangeAnnouncement.tsx`).
 *
 * Distinct from the always-visible `TopologyReviewLink` pill ("Self-Drawing
 * Diff #5"), which persistently shows the CUMULATIVE unreviewed count since
 * baseline and never disappears on its own. This decision instead answers
 * "did the touched-node count just grow, right now" — the transient
 * confirmation that a vault manifest refresh landed on the map, auto-
 * dismissed a few seconds later. Reuses the same source count
 * (`ontologyChangeset.touchedNodeIds.size` in `HomePage`) — no new store.
 */
export interface ChangeAnnouncementDecision {
  show: boolean;
  /** How many additional nodes just became touched — 0 when `show` is false. */
  delta: number;
}

/**
 * `previousCount === null` means this is the very first observation this
 * session (baseline capture) — never announces, otherwise every page load
 * with a pre-existing unreviewed backlog would falsely read as "just
 * updated". Only a real INCREASE over a previously observed count announces
 * — a decrease (e.g. the baseline advancing after a review) is silent.
 */
export function decideChangeAnnouncement(
  previousCount: number | null,
  currentCount: number,
): ChangeAnnouncementDecision {
  if (previousCount === null || currentCount <= previousCount) {
    return { show: false, delta: 0 };
  }
  return { show: true, delta: currentCount - previousCount };
}
