export { OntologyMap } from './ui/OntologyMap';
export { OntologyTerritoriesMap } from './ui/OntologyTerritoriesMap';
export type {
  OntologyMapNode,
  OntologyMapEdge,
} from './ui/OntologyMap';
export { OntologyMapDetailPanel } from './ui/OntologyMapDetailPanel';
export { OntologyMapEdgeHoverCard } from './ui/OntologyMapEdgeHoverCard';
export type { HoverAvoidRect } from './ui/topology-pointer-handlers';
export { OntologyMapClusterHoverCard } from './ui/OntologyMapClusterHoverCard';
export { OntologyMapContextMenu } from './ui/OntologyMapContextMenu';
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
export {
  clearOntologyMapTokensCache,
  refreshIndexDependentTokens,
} from './tokens/read-map-tokens';
export { ambientSleepFactor, isAmbientAsleep } from './model/ambient-sleep';
export { PLAIN_TIER_REVEAL } from './model/tier-visibility';
export type { TierRevealConfig } from './model/tier-visibility';
export { OntologyMapEdgePanel } from './ui/OntologyMapEdgePanel';
/**
 * The 3D placement the map's Cone view draws (`model/dome-view.ts`), for a surface that must
 * draw **the same object** the map does — the download gateway's hero (2026-09-08). Exported
 * here rather than reached into, because the slice rule forbids a view importing a widget's
 * internals; the gateway consumes the coordinates and draws nothing of the map's chrome.
 */
export { buildDomeModel } from './model/dome-view';
export type { DomeInputNode, DomeViewKind } from './model/dome-view';
export { computeGalaxyLayout } from './model/galaxy-layout';
