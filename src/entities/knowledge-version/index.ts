export type {
  KnowledgeVersion,
  KnowledgeVersionMarkdownDiff,
  KnowledgeVersionMetadataDiff,
  KnowledgeVersionRecordInput,
} from "./model";
export {
  fromFirestoreKnowledgeVersion,
  toFirestoreKnowledgeVersion,
  createKnowledgeVersionRecord,
  buildKnowledgeVersionMetadataDiff,
  buildKnowledgeVersionMarkdownDiff,
} from "./model";
