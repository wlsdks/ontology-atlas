'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import { bundledSamples, deriveOntologyFromVault } from '@/entities/docs-vault';
import { buildSampleMapGraph, type SampleMapGraph } from '../lib/sample-map-graph';

export type SampleMap =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ready'; graph: SampleMapGraph };

const SAMPLE = 'storefront';

/**
 * The sample arrives as one file made at build time: whole, or not at all. Its loader tries twice
 * before it gives up, so `failed` means the connection is the problem and a third try is the
 * visitor's to ask for.
 */
export function useSampleMap(): SampleMap {
  const locale = useLocale();
  const state = useSyncExternalStore(
    bundledSamples.subscribe,
    () => bundledSamples.state(SAMPLE),
    () => 'idle' as const,
  );
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    void bundledSamples.load(SAMPLE);
  }, []);

  const source = state === 'ready' ? bundledSamples.peek(SAMPLE) : null;
  const graph = useMemo(
    () => (source ? buildSampleMapGraph(deriveOntologyFromVault(source.manifest), locale) : null),
    [source, locale],
  );
  const retry = useCallback(() => {
    setRetrying(true);
    void bundledSamples.retry(SAMPLE).then(() => setRetrying(false));
  }, []);

  if (graph) return { status: 'ready', graph };
  if (state === 'failed' && !retrying) return { status: 'failed', retry };
  return { status: 'loading' };
}
