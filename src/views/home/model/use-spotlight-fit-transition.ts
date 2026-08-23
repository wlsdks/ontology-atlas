'use client';

import { useState } from 'react';

/** The primitive inputs that change which map meaning needs a camera fit. */
export interface SpotlightFitSignatureInput {
  recentWindow: string | number | null;
  spotlightOn: boolean;
  pathSourceSlug: string | null;
  pathTargetSlug: string | null;
  expandAllActive: boolean;
}

/**
 * Stable primitive identity for the map meanings that warrant one spotlight fit.
 * Arrays are encoded rather than concatenated so null, booleans, and slugs cannot
 * collide through a delimiter in a user-controlled slug.
 */
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
 * A monotonic camera-fit trigger for a primitive map-meaning signature.
 *
 * Initial token 0 is a one-shot fit request, so a deep-linked spotlight is framed
 * on mount. Every later signature transition is adjusted during render, so React
 * retries before paint and the map receives exactly one new token without an
 * effect-driven cascade.
 */
export function useSpotlightFitTransition(signature: string): number {
  const [transition, setTransition] = useState(() => ({ signature, token: 0 }));

  if (transition.signature !== signature) {
    setTransition({ signature, token: transition.token + 1 });
  }

  return transition.signature === signature ? transition.token : transition.token + 1;
}
