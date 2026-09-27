'use client';

import { useState } from 'react';

export interface SpotlightFitSignatureInput {
  recentWindow: string | number | null;
  spotlightOn: boolean;
  pathSourceSlug: string | null;
  pathTargetSlug: string | null;
  expandAllActive: boolean;
}

/** Encoded, not concatenated, so a user slug cannot collide through a delimiter. */
export function buildSpotlightFitSignature({
  recentWindow,
  spotlightOn,
  pathSourceSlug,
  pathTargetSlug,
  expandAllActive,
}: SpotlightFitSignatureInput): string {
  return JSON.stringify([recentWindow, spotlightOn, pathSourceSlug, pathTargetSlug, expandAllActive]);
}

/**
 * Token 0 is a one-shot fit, so a deep-linked spotlight frames on mount. Later changes adjust
 * during render, giving exactly one new token without an effect cascade.
 */
export function useSpotlightFitTransition(signature: string): number {
  const [transition, setTransition] = useState(() => ({ signature, token: 0 }));

  if (transition.signature !== signature) {
    setTransition({ signature, token: transition.token + 1 });
  }

  return transition.signature === signature ? transition.token : transition.token + 1;
}
