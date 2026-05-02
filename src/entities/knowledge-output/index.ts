export type {
  KnowledgeOutput,
  KnowledgeOutputEdge,
  KnowledgeOutputNode,
  KnowledgeOutputGrade,
  KnowledgeOutputUsage,
  ConfidenceTier,
} from "./model";
export {
  fromFirestoreKnowledgeOutput,
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
  clampConfidence,
  getConfidenceTier,
  isAutoApprovable,
  requiresExplicitReview,
} from "./model";
// API 는 `@/entities/knowledge-output/api` 로 분리.
