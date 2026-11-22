/**
 * "Allow once" cannot be pressed without the request's option, while the meaning is being accepted,
 * while the review basis is loading, or when the connected folder does not match.
 */
export function isAllowOnceDisabled({
  hasAllowOnceOption,
  acceptingMeaning,
  reviewStatus,
  executionBlocked,
}: {
  hasAllowOnceOption: boolean;
  acceptingMeaning: boolean;
  reviewStatus: string | undefined;
  executionBlocked: boolean | undefined;
}): boolean {
  return Boolean(!hasAllowOnceOption || acceptingMeaning || reviewStatus === 'loading' || executionBlocked);
}

/** Whether the person has already accepted this change's meaning; `unknown` hides the row. */
export function meaningAuthority(
  review: { status: string; meaningStatus: string } | undefined,
): 'accepted' | 'pending' | 'unknown' {
  return review?.status === 'ready'
    ? review.meaningStatus === 'accepted' ? 'accepted' : 'pending'
    : 'unknown';
}
