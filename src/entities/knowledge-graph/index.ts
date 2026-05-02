export type {
  EdgeQualifier,
  EdgeRank,
  KnowledgeEdgeType,
  KnowledgeGraphSource,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  KnowledgeProjectInsight,
  ManualNodeKind,
  QualifierValue,
} from "./model";
export {
  KNOWLEDGE_EDGE_TYPES,
  isKnowledgeEdgeType,
  KNOWLEDGE_GRAPH_SOURCES,
  isKnowledgeGraphSource,
} from "./model";
// R10b — cloud Firestore 의존 hook (`useKnowledgePublic*`) 및 mutation 함수
// (`addManualKnowledgeNode/Edge`, `subscribeKnowledgeProjectInsight` 등) 영구
// 제거. mission v2 single-source ('vault frontmatter = graph') 정합. 미래
// cloud collab 단계가 다시 도입될 때 새 api/ 폴더로.
export { ManualSourceChip } from "./ui/ManualSourceChip";
export type { ManualSourceChipProps } from "./ui/ManualSourceChip";
