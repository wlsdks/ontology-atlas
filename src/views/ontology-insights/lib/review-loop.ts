type DoNextReviewPhase =
  | "checking"
  | "active"
  | "cleared"
  | "unverified";

export interface DoNextReviewState {
  id: string;
  phase: DoNextReviewPhase;
  title: string | null;
}

// The meaning-finding sections leave the board through the same chips as an orphan, so their ids must match here
// or the reader is stranded on the way back.
const REVIEW_ID_PATTERN =
  /^(neglected-hub|orphan|promotion|cycle|missing-boundary|missing-uncertainty|epistemic-exclusion|slug-outside-kind-folder):[^\u0000-\u001f\u007f]{1,480}$/;

export function isDoNextReviewId(value: string | null): value is string {
  return Boolean(value && REVIEW_ID_PATTERN.test(value));
}

interface ResolveDoNextReviewStateInput {
  reviewId: string | null;
  authoritative: boolean;
  activeReviewIds: ReadonlySet<string>;
  titleByReviewId?: ReadonlyMap<string, string>;
  cycleInventoryLimited: boolean;
  /**
   * Prefixes whose inventory was cut to a display limit: absence there is "unverified", never "cleared".
   * The cycle flag is the same idea under its own name.
   */
  limitedPrefixes?: ReadonlySet<string>;
}

/** The value `cleared` is the current vault observation, not a history: the same row id reappearing is active again. */
export function resolveDoNextReviewState({
  reviewId,
  authoritative,
  activeReviewIds,
  titleByReviewId,
  cycleInventoryLimited,
  limitedPrefixes,
}: ResolveDoNextReviewStateInput): DoNextReviewState | null {
  if (!reviewId) return null;
  if (!isDoNextReviewId(reviewId)) {
    return { id: reviewId, phase: "unverified", title: null };
  }
  const title = titleByReviewId?.get(reviewId) ?? null;
  if (!authoritative) {
    return { id: reviewId, phase: "checking", title };
  }
  if (activeReviewIds.has(reviewId)) {
    return { id: reviewId, phase: "active", title };
  }
  if (reviewId.startsWith("cycle:") && cycleInventoryLimited) {
    return { id: reviewId, phase: "unverified", title };
  }
  const prefix = reviewId.slice(0, reviewId.indexOf(":"));
  if (limitedPrefixes?.has(prefix)) {
    return { id: reviewId, phase: "unverified", title };
  }
  return { id: reviewId, phase: "cleared", title };
}
