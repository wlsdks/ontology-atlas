export { OntologyMap } from './ui/OntologyMap';
export { OntologyTerritoriesMap } from './ui/OntologyTerritoriesMap';
export { OntologyHexBoardMap } from './ui/OntologyHexBoardMap';
export { OntologyCosmosMap } from './galaxy/OntologyCosmosMap';
export type { CosmosMirrorLabels } from './galaxy/CosmosMirror';
export type { CosmosPlacementRecord } from './galaxy/layout/cosmos-layout';
export type { CosmosPlacementStore } from './galaxy/OntologyCosmosMap';
export { MapLayoutMorphOverlay, installMapLayoutMorphProbe } from './morph/MapLayoutMorphOverlay';
export type { MapLayoutMorphJob } from './morph/MapLayoutMorphOverlay';
export { chooseLayoutSwitch, containmentParents } from './morph/layout-morph';
export { conceptDegrees } from './morph/glide';
export { predictMapLayoutTarget } from './morph/map-marks';
export type { HexBoardLabels } from './ui/OntologyHexBoardMap';
export type { HexPlacementRecord } from './model/hex-board';
export type {
  OntologyMapNode,
  OntologyMapEdge,
} from './ui/OntologyMap';
export { OntologyMapDetailPanel } from './ui/OntologyMapDetailPanel';
export { OntologyMapEdgeHoverCard } from './ui/OntologyMapEdgeHoverCard';
export type { HoverAvoidRect } from './ui/topology-pointer-handlers';
export { OntologyMapClusterHoverCard } from './ui/OntologyMapClusterHoverCard';
export { OntologyMapContextMenu } from './ui/OntologyMapContextMenu';
export { requestOntologyMapFrame } from './ui/use-topology-frame-loop';
export {
  buildV2Connections,
  buildV2ConnectionGroups,
  buildV2EvidenceRows,
  formatV2HandoffText,
} from './ui/map-datasheet';
/**
 * INDEX panel's expand/collapse toggles the DOM `data-topology-index`
 * attribute that drives `--map-safe-inset-left` (`app/globals.css`),
 * so the map's camera fit must be forced to re-read the token instead of
 * trusting its mount-time cache (B3 "The Hub is the Map" — HomePage wiring).
 */
export { refreshIndexDependentTokens } from './tokens/read-map-tokens';
export { ambientSleepFactor, isAmbientAsleep } from './model/ambient-sleep';
export { PLAIN_TIER_REVEAL } from './model/tier-visibility';
export { OntologyMapEdgePanel } from './ui/OntologyMapEdgePanel';
export { layoutCone } from './model/cone-layout';
export type { ConeInputNode, ConeKind } from './model/cone-layout';
export { computeGalaxyLayout } from './model/galaxy-layout';
/**
 * Where the last frame drew each node's name and disc, for chrome outside the map that must
 * leave what it explains in view (the guided tour's card).
 */
export { readDrawnMapMarks } from './ui/drawn-map-marks';
