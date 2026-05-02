// Firestore 구독 / mutation / 훅 — barrel 진입점.
// `@/entities/knowledge-graph` (lib/types only) 와 분리해 firebase 의존이
// 정적 그래프로 leak 되지 않게 한다.
export {
  listKnowledgeProjectInsight,
  subscribeKnowledgeProjectInsight,
  subscribeKnowledgePublicGraph,
  subscribeKnowledgeApprovedGraph,
  subscribeKnowledgePublicMeta,
  addManualKnowledgeNode,
  addManualKnowledgeEdge,
} from './knowledge-graph-api';
export type {
  AddManualKnowledgeNodeResult,
  AddManualKnowledgeEdgeResult,
} from './knowledge-graph-api';
export { useKnowledgePublicNodes } from './use-knowledge-public-nodes';
export { useKnowledgePublicInsight } from './use-knowledge-public-insight';
export type { UseKnowledgePublicInsightResult } from './use-knowledge-public-insight';
