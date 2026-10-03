'use client';

import { useMemo } from 'react';
import { useDogfoodInsight } from '@/features/vault-ontology';
import { buildStageGraph, type StageGraph } from './stage-graph';

/**
 * The one graph the hero and the conduction figure draw. Pinned to this repository's vault, not
 * the session's choice; memoised per locale, so two callers derive once.
 */
export function useStageGraph(): StageGraph {
  const insight = useDogfoodInsight();
  return useMemo(() => buildStageGraph(insight.nodes, insight.edges), [insight]);
}
