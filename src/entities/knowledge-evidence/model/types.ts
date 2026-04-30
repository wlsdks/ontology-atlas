export interface KnowledgeEvidence {
  id: string;
  accountId?: string;
  documentId: string;
  documentVersionId: string;
  versionHash: string;
  chunkId: string;
  chunkHash: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  locatorVersion: string;
  extractorVersion: string;
  sourceOutputId: string;
  createdAt: Date;
}
