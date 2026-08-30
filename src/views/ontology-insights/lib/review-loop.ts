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

const REVIEW_ID_PATTERN =
  /^(neglected-hub|orphan|promotion|cycle):[^\u0000-\u001f\u007f]{1,480}$/;

export function isDoNextReviewId(value: string | null): value is string {
  return Boolean(value && REVIEW_ID_PATTERN.test(value));
}

interface ResolveDoNextReviewStateInput {
  reviewId: string | null;
  authoritative: boolean;
  activeReviewIds: ReadonlySet<string>;
  titleByReviewId?: ReadonlyMap<string, string>;
  cycleInventoryLimited: boolean;
}

/**
 * `cleared` is not a completion history but the current vault observation. If the same exact row id
 * reappears in the signal set, it returns to active immediately.
 */
export function resolveDoNextReviewState({
  reviewId,
  authoritative,
  activeReviewIds,
  titleByReviewId,
  cycleInventoryLimited,
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
  return { id: reviewId, phase: "cleared", title };
}
