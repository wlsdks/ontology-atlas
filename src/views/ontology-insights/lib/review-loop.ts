export type DoNextReviewPhase =
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
 * `cleared`는 완료 이력이 아니라 현재 vault 관측값이다. 같은 exact row id가
 * 다시 신호 집합에 나타나면 곧바로 active로 돌아간다.
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
