export type {
  KnowledgeEdgeType,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  KnowledgeProjectInsight,
  ManualNodeKind,
} from "./model";
export {
  KNOWLEDGE_EDGE_TYPES,
  useEdgeTypeLabel,
  buildEdgeTypeRows,
} from "./model";
export type { EdgeTypeRow } from "./model";
export {
  buildOntologyBuilderNodeHref,
  buildOntologyNodeHref,
  resolveOntologyBuilderNodeSlug,
} from "./lib/ontology-node-href";
export {
  buildOntologyHealthSignals,
  type OntologyHealthSignalCandidate,
  type OntologyHealthSignals,
} from "./lib/ontology-health-signals";
