/**
 * Decides the transient "N concepts updated" chip (`ui/TopologyChangeAnnouncement.tsx`): did the
 * touched-node count just grow.
 * Unlike the persistent `TopologyReviewLink` cumulative count, it auto-dismisses after a few
 * seconds.
 */
export interface ChangeAnnouncementDecision {
  show: boolean;
  delta: number;
}

/**
 * A null `previousCount` is the session baseline and never announces, or a pre-existing backlog
 * would read as "just updated".
 * Only an increase announces; a decrease (baseline advancing after review) is silent.
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
