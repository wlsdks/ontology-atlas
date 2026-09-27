'use client';

import dynamic from 'next/dynamic';
import { startTransition, useEffect, useState } from 'react';
import { InsightsLoadingView } from './InsightsLoadingView';

const Analysis = dynamic(
  () => import('./OntologyInsightsPage').then((module) => module.OntologyInsightsPage),
  { ssr: false, loading: InsightsLoadingView },
);

/**
 * Commits the light destination before importing and mounting the graph analysis, which blocks in `useMemo` where
 * Suspense cannot yield. Two animation frames cross a paint boundary; they are not a minimum delay.
 */
export function InsightsPageEntry() {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        startTransition(() => setPainted(true));
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return painted ? <Analysis /> : <InsightsLoadingView />;
}
