export { OntologyMap } from './ui/OntologyMap';
export { OntologyHexBoardMap } from './ui/OntologyHexBoardMap';
export { MapLayoutMorphOverlay, installMapLayoutMorphProbe } from './morph/MapLayoutMorphOverlay';
export type { MapLayoutMorphJob } from './morph/MapLayoutMorphOverlay';
export { chooseLayoutSwitch, containmentParents } from './morph/layout-morph';
export { conceptDegrees } from './morph/glide';
export { extractRealmSubtree } from './model/realm/realm';
export { predictMapLayoutTarget } from './morph/map-marks';
export type { HexBoardLabels } from './ui/OntologyHexBoardMap';
export type { HexPlacementRecord } from './model/board/hex-board';
export type { DialLabels, DialMemory } from './dial/types';
export { capabilityTierRead } from './dial/placement';
export { adoptBodyLabelFont } from './render/labels';
export type { FlatRingMemoryStore } from './ui/loop/topology-loop-contract';
export type { OntologyMapNode, OntologyMapEdge, } from './ui/OntologyMap';
export { OntologyMapDetailPanel } from './ui/OntologyMapDetailPanel';
export { OntologyMapEdgeHoverCard } from './ui/OntologyMapEdgeHoverCard';
export type { HoverAvoidRect } from './ui/input/topology-pointer-types';
export { OntologyMapClusterHoverCard } from './ui/OntologyMapClusterHoverCard';
export { OntologyMapContextMenu } from './ui/OntologyMapContextMenu';
export { requestOntologyMapFrame } from './ui/frame-loop/use-topology-frame-loop';
export { buildV2Connections, buildV2ConnectionGroups, buildV2EvidenceRows, formatV2HandoffText, } from './ui/detail-panel/map-datasheet';
/**
 * INDEX panel's expand/collapse toggles the DOM `data-topology-index`
 * attribute that drives `--map-safe-inset-left` (`app/globals.css`),
 * so the map's camera fit must be forced to re-read the token instead of
 * trusting its mount-time cache (B3 "The Hub is the Map" — HomePage wiring).
 */
export { refreshIndexDependentTokens } from './tokens/read-map-tokens';
export { ambientSleepFactor, isAmbientAsleep } from './model/ambient/ambient-sleep';
export { PLAIN_TIER_REVEAL } from './model/visibility/tier-visibility';
export { OntologyMapEdgePanel } from './ui/OntologyMapEdgePanel';
export { layoutCone } from './model/dome-view/cone-layout';
export type { ConeInputNode, ConeKind } from './model/dome-view/cone-layout';
/**
 * Where the last frame drew each node's name and disc, for chrome outside the map that must
 * leave what it explains in view (the guided tour's card).
 */
export { DomainStructureMap } from "./structure/DomainStructureMap";
export { readDomainUsage, type DomainUsage } from "./model/domain-usage";
