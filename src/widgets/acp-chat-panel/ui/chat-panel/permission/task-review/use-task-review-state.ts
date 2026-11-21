'use client';

import { useCallback, useState } from 'react';

export type ReviewDepth = 'summary' | 'compare' | 'details';

/**
 * What a person has done in the review of one request: how deep they are looking, whether they
 * acknowledged the full scope, the rationale they typed and whether the full details are on screen.
 * Everything is keyed by `reviewStateKey`, so a new request starts from the summary with nothing
 * acknowledged.
 */
export function useTaskReviewState(reviewStateKey: string) {
  const [reviewState, setReviewState] = useState<{
    key: string;
    depth: ReviewDepth;
    acknowledgeFullScope: boolean;
  }>({ key: reviewStateKey, depth: 'summary', acknowledgeFullScope: false });
  const depth = reviewState.key === reviewStateKey ? reviewState.depth : 'summary';
  const acknowledgeFullScope = reviewState.key === reviewStateKey
    ? reviewState.acknowledgeFullScope
    : false;
  const setDepth = (next: ReviewDepth) => {
    setReviewState({ key: reviewStateKey, depth: next, acknowledgeFullScope: false });
  };
  const setFullScopeAcknowledged = (acknowledged: boolean) => {
    setReviewState({ key: reviewStateKey, depth: 'details', acknowledgeFullScope: acknowledged });
  };
  const [acceptingMeaning, setAcceptingMeaning] = useState(false);
  const [meaningRationale, setMeaningRationale] = useState({ key: reviewStateKey, value: '' });
  const rationale = meaningRationale.key === reviewStateKey ? meaningRationale.value : '';
  const setRationale = (value: string) => setMeaningRationale({ key: reviewStateKey, value });
  const [detailsAvailability, setDetailsAvailability] = useState({ key: reviewStateKey, available: false });
  const fullDetailsAvailable = detailsAvailability.key === reviewStateKey && detailsAvailability.available;
  const handleFullScopeAvailable = useCallback((available: boolean) => {
    setDetailsAvailability({ key: reviewStateKey, available });
  }, [reviewStateKey]);

  return {
    depth,
    setDepth,
    acknowledgeFullScope,
    setFullScopeAcknowledged,
    acceptingMeaning,
    setAcceptingMeaning,
    rationale,
    setRationale,
    fullDetailsAvailable,
    handleFullScopeAvailable,
  };
}
