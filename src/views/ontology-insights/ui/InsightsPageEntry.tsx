'use client';

import dynamic from 'next/dynamic';
import { startTransition, useEffect, useState } from 'react';
import { InsightsLoadingView } from './InsightsLoadingView';

const Analysis = dynamic(
  () => import('./OntologyInsightsPage').then((module) => module.OntologyInsightsPage),
  { ssr: false, loading: InsightsLoadingView },
);

/**
 * Commit the lightweight destination before importing or mounting synchronous
 * graph analysis. Suspense alone cannot yield inside a component's useMemo.
 * Two animation frames cross a paint boundary, not an artificial minimum delay.
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
