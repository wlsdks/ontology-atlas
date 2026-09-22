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

/*
 * The four meaning-finding sections joined on 2026-09-23: their rows leave the board
 * through the same visible chips as an orphan's, and a chip that does not claim its row
 * strands the reader on the way back (the CI sample vault opened on one, and both the
 * restore test and the row-menu audit died on it).
 */
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
   * Review-id prefixes whose inventory was cut to a display limit, so an id missing
   * from `activeReviewIds` may simply be past the cut: absence there is "unverified",
   * never "cleared". The cycle flag is the same idea with its own name.
   */
  limitedPrefixes?: ReadonlySet<string>;
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
