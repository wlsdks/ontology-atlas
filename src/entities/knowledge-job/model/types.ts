export type KnowledgeJobStatus =
  | "queued"
  | "leased"
  | "processing"
  | "succeeded"
  | "failed"
  | "superseded";

export interface KnowledgeJob {
  id: string;
  accountId?: string;
  documentId: string;
  documentVersionId: string;
  extractorVersion: string;
  idempotencyKey: string;
  status: KnowledgeJobStatus;
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
  nextAttemptAt?: Date;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  generation: number;
  errorCode?: string;
  errorMessage?: string;
  supersededByJobId?: string;
  createdAt: Date;
  updatedAt: Date;
  requestedBy: string;
}

export interface KnowledgeJobActionState {
  canRetry: boolean;
  canViewResult: boolean;
  canOpenReplacement: boolean;
  helperText: string;
}

export interface EnqueueKnowledgeExtractionJobInput {
  accountId?: string | null;
  documentId: string;
  documentVersionId: string;
  extractorVersion?: string;
}

export interface EnqueueKnowledgeExtractionJobResult {
  jobId: string;
  created: boolean;
  status: KnowledgeJobStatus;
  idempotencyKey: string;
}
