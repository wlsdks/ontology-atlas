'use client';

import { useMemo } from 'react';
import { useDogfoodInsight } from '@/features/vault-ontology';
import { buildStageGraph, type StageGraph } from './stage-graph';

/**
 * The graph the start steps read concept names from. Pinned to this repository's vault, not
 * the session's choice; memoised per locale, so two callers derive once.
 */
export function useStageGraph(): StageGraph {
  const insight = useDogfoodInsight();
  return useMemo(() => buildStageGraph(insight.nodes, insight.edges), [insight]);
}
