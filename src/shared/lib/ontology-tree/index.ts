export type {
  OntologyTreeNode,
  OntologyTreeBuildResult,
  OntologyEgoNeighbor,
  OntologyEgoSubgraph,
} from "./types";
export type {
  EgoLayoutPoint,
  EgoLayoutNeighborPoint,
  EgoLayoutEdge,
  EgoLayoutResult,
} from "./ego-layout";
export type { OntologyDegreeRow, ActivityTimelineDay } from "./insights";
export { buildOntologyTree, countTreeNodes, flattenTree } from "./build-tree";
export { buildOntologyEgoSubgraph } from "./build-ego";
export { buildRadialEgoLayout } from "./ego-layout";
export { filterTreeByQuery } from "./filter-tree";
export {
  computeEdgeTypeDistribution,
  countCrossProjectEdges,
  isCrossProjectEdgeProjects,
} from "./relations";
export { recommendDocumentSlug } from "./recommend-slug";
export {
  computeKindDistribution,
  computeDegreeCentrality,
  selectTopByDegree,
  selectRecentNodes,
  buildActivityTimeline,
} from "./insights";
export type { SimilarityCandidate, SimilarityMatch } from "./similarity";
export { findSimilarOntologyNodes } from "./similarity";
export type { MeaningfulOntologyKind, OntologyKindStats } from "./kind-stats";
export {
  MEANINGFUL_ONTOLOGY_KINDS,
  isMeaningfulOntologyKind,
  countMeaningfulOntologyNodes,
  buildMeaningfulOntologyStats,
} from "./kind-stats";
export type { OntologyCountsForProject } from "./project-ontology-counts";
export {
  buildProjectOntologyCounts,
  pickDominantOntologyKind,
} from "./project-ontology-counts";
export { UNKNOWN_TONE } from "./tones";
