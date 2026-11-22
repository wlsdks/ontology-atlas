export { OntologyMap } from './ui/OntologyMap';
export { OntologyHexBoardMap } from './ui/OntologyHexBoardMap';
export { MapLayoutMorphOverlay, installMapLayoutMorphProbe } from './morph/MapLayoutMorphOverlay';
export type { MapLayoutMorphJob } from './morph/MapLayoutMorphOverlay';
export { chooseLayoutSwitch, containmentParents } from './morph/layout-morph';
export { conceptDegrees } from './morph/glide';
export { extractRealmSubtree } from './model/realm/realm';
export { predictMapLayoutTarget } from './morph/map-marks';
export { predictTreeTarget } from './morph/tree-marks';
export type { HexBoardLabels } from './ui/hex-board/hex-board-labels';
export { OntologyTreeMap } from './ui/OntologyTreeMap';
export type { TreeMapLabels } from './ui/OntologyTreeMap';
export type { HexPlacementRecord } from './model/board/hex-board';
export type { DialLabels, DialMemory } from './dial/dial-shapes';
export { capabilityTierRead } from './dial/placement';
export { adoptBodyLabelFont, bodyLabelFontAdopted, bodyLabelFontSettled } from './render/labels';
export type { FlatDialState, FlatRingMemoryStore } from './ui/loop/topology-loop-contract';
export { FLAT_LINE_BITS } from './flat-graph/attention';
export { readFlatGraphTokens } from './flat-graph/tokens';
export type { OntologyMapNode, OntologyMapEdge, } from './ui/OntologyMap';
export { OntologyMapDetailPanel } from './ui/OntologyMapDetailPanel';
export type { ConceptReview } from './ui/detail-panel/detail-panel-props';
export { OntologyMapEdgeHoverCard } from './ui/OntologyMapEdgeHoverCard';
export type { HoverAvoidRect } from './ui/input/topology-pointer-types';
export { OntologyMapClusterHoverCard } from './ui/OntologyMapClusterHoverCard';
export { OntologyMapContextMenu } from './ui/OntologyMapContextMenu';
export { requestOntologyMapFrame } from './ui/frame-loop/use-topology-frame-loop';
export { buildV2Connections, buildV2ConnectionGroups, buildV2EvidenceRows, formatV2HandoffText, } from './ui/detail-panel/map-datasheet';
/** Forces the camera fit to re-read `--map-safe-inset-left`, which the INDEX panel toggles through `data-topology-index`. */
export { refreshIndexDependentTokens } from './tokens/read-map-tokens';
export { ambientSleepFactor, isAmbientAsleep } from './model/ambient/ambient-sleep';
export { PLAIN_TIER_REVEAL, RECENT_SPOTLIGHT_REVEAL_MAX } from './model/visibility/tier-visibility';
export { OntologyMapEdgePanel } from './ui/OntologyMapEdgePanel';
/**
 * Where the last frame drew each node's name and disc, for chrome outside the map that must
 * leave what it explains in view (the guided tour's card).
 */
export { DomainStructureMap } from "./structure/DomainStructureMap";
export { readDomainUsage, type DomainUsage } from "./model/domain-usage";
export { readConceptReach, type ConceptReach } from "./model/concept-reach";
export type { NeuralLabels } from './ui/frame-draw/neural/paint-neural';
export { neuralImpactOfMapEdges } from './model/dome-view/neural/neural-impact';
