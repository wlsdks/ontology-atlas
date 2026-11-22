'use client';

import { useMemo } from 'react';
import { useDogfoodInsight } from '@/features/vault-ontology';
import { buildStageGraph, type StageGraph } from './stage-graph';

export function useStageGraph(): StageGraph {
  const insight = useDogfoodInsight();
  return useMemo(() => buildStageGraph(insight.nodes, insight.edges), [insight]);
}
