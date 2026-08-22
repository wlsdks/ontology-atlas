'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  getSampleSourceServerSnapshot,
  getSampleSourceSnapshot,
  subscribeSampleSource,
  writeSampleSourcePreference,
  type SampleSource,
} from '@/shared/lib/sample-source';

/**
 * Which bundled sample to show in static mode (no vault chosen) — "look around this tool"
 * (dogfood) or "see an example business" (storefront). `useOntologyInsight` reads this to
 * pick one of the two manifests. In local mode (a vault is loaded) the choice is never
 * consumed — the user's disk always wins.
 *
 * It subscribes to a single module store (`useSyncExternalStore`), so a change made in the
 * first-run card propagates immediately to every `useOntologyInsight` instance reading the
 * same store (fixing the defect where, with independent `useState`, the map did not change
 * until a reload). SSR and hydration always snapshot 'dogfood', so there is no mismatch.
 */
export function useSampleSource(): [SampleSource, (next: SampleSource) => void] {
  const source = useSyncExternalStore(
    subscribeSampleSource,
    getSampleSourceSnapshot,
    getSampleSourceServerSnapshot,
  );

  const setSource = useCallback((next: SampleSource) => {
    writeSampleSourcePreference(next);
  }, []);

  return [source, setSource];
}
