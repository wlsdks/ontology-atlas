'use client';

import { useMemo, useState } from 'react';
import {
  computeAdaptiveRecentChanges,
  computeRecentChanges,
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  type AdaptiveRecentChangesResult,
} from '@/entities/knowledge-graph';
import { useOntologyInsight } from './use-ontology-insight';
import { useVaultDocDates } from './use-vault-doc-freshness';

/** The recent-changes lens: `useVaultDocDates` and `useOntologyInsight` fed into the pure `computeAdaptiveRecentChanges`. */
export interface RecentChangesLens extends AdaptiveRecentChangesResult {
  /** The dates are still being read (`VaultDocDates.reading`): the lens counts nothing yet. */
  reading: boolean;
}

const EMPTY_ADAPTIVE: AdaptiveRecentChangesResult = {
  recentNodeIds: new Set(),
  rows: [],
  windowDays: RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
};

/**
 * Narrows 7d→3d→1d when a window would pass most nodes; a numeric `overrideWindowDays` fixes
 * the window instead. The map and the INDEX lens share this hook.
 */
export function useAdaptiveRecentChanges(
  overrideWindowDays?: number,
): RecentChangesLens {
  const { index: freshnessIndex, reading } = useVaultDocDates();
  const { insight } = useOntologyInsight();
  const [nowMs] = useState(() => Date.now());

  return useMemo(() => {
    if (!insight) return { ...EMPTY_ADAPTIVE, reading };
    if (overrideWindowDays !== undefined) {
      const fixed = computeRecentChanges(insight.nodes, freshnessIndex, nowMs, overrideWindowDays);
      return { ...fixed, windowDays: overrideWindowDays, reading };
    }
    return { ...computeAdaptiveRecentChanges(insight.nodes, freshnessIndex, nowMs), reading };
  }, [insight, freshnessIndex, nowMs, overrideWindowDays, reading]);
}
