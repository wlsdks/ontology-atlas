export type {
  KnowledgeJob,
  KnowledgeJobActionState,
  KnowledgeJobStatus,
} from "./model";
export {
  fromFirestoreKnowledgeJob,
  resolveKnowledgeJobActionState,
} from "./model";
// API 는 `@/entities/knowledge-job/api` 로 분리.
export {
  KNOWLEDGE_JOB_STATUS_OPTIONS,
  getKnowledgeJobStatusLabel,
  getKnowledgeJobStatusDotColor,
  type KnowledgeJobStatusDotColor,
} from "./lib";
