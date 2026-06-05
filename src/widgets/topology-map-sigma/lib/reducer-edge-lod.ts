import type { SigmaNodeAttrs } from './graph-build';

export const DENSE_OVERVIEW_EDGE_COUNT = 240;
// Keep dense ontology edges collapsed until the user is clearly inspecting
// close-up. Saved mid-zoom camera state should not revive the full relation web.
export const DENSE_OVERVIEW_EDGE_LOD_RATIO = 0.33;

export function shouldSuppressDenseOverviewEdges({
  edgeCount,
  overviewEdgesReady,
}: {
  edgeCount: number;
  overviewEdgesReady: boolean;
}): boolean {
  return edgeCount >= DENSE_OVERVIEW_EDGE_COUNT && !overviewEdgesReady;
}

function isOverviewEdgeAnchor(attrs: SigmaNodeAttrs): boolean {
  return attrs.isHub === true || attrs.overviewLandmark === true;
}

function isTopologyBackboneNode(attrs: SigmaNodeAttrs): boolean {
  if (attrs.isOntology !== true) return true;
  return attrs.ontologyTopKind === 'domain';
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

  if (!isTopologyBackboneNode(source) || !isTopologyBackboneNode(target)) {
    return true;
  }

  return !(isOverviewEdgeAnchor(source) && isOverviewEdgeAnchor(target));
}
