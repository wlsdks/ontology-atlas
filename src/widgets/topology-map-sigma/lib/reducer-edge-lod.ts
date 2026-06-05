import type { SigmaNodeAttrs } from './graph-build';

export const DENSE_OVERVIEW_EDGE_COUNT = 240;
export const DENSE_OVERVIEW_EDGE_LOD_RATIO = 0.85;

function isOverviewEdgeAnchor(attrs: SigmaNodeAttrs): boolean {
  return attrs.isHub === true || attrs.overviewLandmark === true;
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
  if (edgeCount < DENSE_OVERVIEW_EDGE_COUNT) return false;
  if (cameraRatio < DENSE_OVERVIEW_EDGE_LOD_RATIO) return false;
  if (source.isOntology !== true && target.isOntology !== true) return false;

  return !(isOverviewEdgeAnchor(source) && isOverviewEdgeAnchor(target));
}
