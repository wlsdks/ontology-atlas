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

/**
 * The mode-aware adapter for the "recent changes" lens. It passes `useVaultDocDates()` (slug →
 * when the document last changed, from Git where Git knows) and `useOntologyInsight()` (the
 * current graph nodes) straight into the pure `computeAdaptiveRecentChanges`
 * (`@/entities/knowledge-graph/lib/ontology-tree`) — the mode branch and the time arithmetic are already
 * owned by those two hooks and that pure function, so nothing new is built here (the same
 * thin composition pattern as `use-ontology-insight.ts` / `use-vault-doc-freshness.ts`).
 *
 * The reference time is a snapshot from the hook's first call
 * (`useState(() => Date.now())`) — `Date.now()` is never read during render (render purity,
 * matching this repository's existing convention).
 */
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
 * The window-adaptive variant. On a bulk-commit day a 7-day window can let 80% of
 * everything through, at which point the lens stops filtering, so it narrows down a
 * 7d→3d→1d ramp (the `computeAdaptiveRecentChanges` contract). The INDEX lens uses this.
 *
 * Spotlight: when `overrideWindowDays` is a number, that window is **fixed** instead of the
 * adaptive ramp (going straight to `computeRecentChanges`, with `windowDays` echoed back
 * unchanged). The `?recent=1|7|30` preset chips arrive through this argument; omitted or
 * undefined keeps the existing adaptive behaviour. The map's settling and the INDEX lens
 * share this one hook, so the two surfaces' windows cannot diverge.
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
