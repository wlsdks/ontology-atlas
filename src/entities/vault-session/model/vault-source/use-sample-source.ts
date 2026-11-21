'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  getSampleSourceServerSnapshot,
  getSampleSourceSnapshot,
  subscribeSampleSource,
  writeSampleSourcePreference,
  type SampleSource,
} from '@/shared/lib/vault-folder/sample-source';

/** Which bundled sample static mode shows: "look around this tool" (dogfood) or "see an example business" (storefront). In local mode the choice is never consumed: the user's disk wins. A single module store (`useSyncExternalStore`) so a change in the first-run card reaches every reader at once; SSR and hydration snapshot 'dogfood'. */
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
