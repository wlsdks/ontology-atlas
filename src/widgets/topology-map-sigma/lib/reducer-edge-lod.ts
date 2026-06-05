import type { SigmaNodeAttrs } from './graph-build';

export const DENSE_OVERVIEW_EDGE_COUNT = 240;
// Dense ontology graphs are node-first in the unselected map overview. Relation
// proof is still available through focus/path/impact modes, which bypass this
// reducer before calling shouldHideDenseOverviewEdge.

export function shouldSuppressDenseOverviewEdges({
  edgeCount,
  overviewEdgesReady,
}: {
  edgeCount: number;
  overviewEdgesReady: boolean;
}): boolean {
  return edgeCount >= DENSE_OVERVIEW_EDGE_COUNT && !overviewEdgesReady;
}

export function shouldHideDenseOverviewEdge({
  edgeCount,
  cameraRatio,
  source,
  target,
}: {
  edgeCount: number;
  cameraRatio: number;
  source: SigmaNodeAttrs;
  target: SigmaNodeAttrs;
}): boolean {
  void cameraRatio;
  if (edgeCount < DENSE_OVERVIEW_EDGE_COUNT) return false;
  if (source.isOntology !== true && target.isOntology !== true) return false;
  return true;
}
