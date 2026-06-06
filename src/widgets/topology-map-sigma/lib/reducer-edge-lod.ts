import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

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
  edge,
  source,
  target,
}: {
  edgeCount: number;
  cameraRatio: number;
  edge?: Pick<SigmaEdgeAttrs, 'kind' | 'relationType'>;
  source: SigmaNodeAttrs;
  target: SigmaNodeAttrs;
}): boolean {
  void cameraRatio;
  if (edgeCount < DENSE_OVERVIEW_EDGE_COUNT) return false;
  if (source.isOntology !== true && target.isOntology !== true) return false;
  if (isDenseOverviewSkeletonEdge({ edge, source, target })) return false;
  return true;
}

function isDenseOverviewSkeletonEdge({
  edge,
  source,
  target,
}: {
  edge?: Pick<SigmaEdgeAttrs, 'kind' | 'relationType'>;
  source: SigmaNodeAttrs;
  target: SigmaNodeAttrs;
}): boolean {
  if (source.overviewLandmark !== true || target.overviewLandmark !== true) {
    return false;
  }
  if (source.ontologyTopKind === 'element' || target.ontologyTopKind === 'element') {
    return false;
  }
  if (source.ontologyTopKind === 'unknown' || target.ontologyTopKind === 'unknown') {
    return false;
  }
  return edge?.kind === 'contains' || edge?.relationType === 'contains';
}
