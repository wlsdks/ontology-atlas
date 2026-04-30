export interface KnowledgeOutputNode {
  tempId: string;
  title: string;
  kind: string;
  projectIds: string[];
  summary: string;
  confidence: number;
  warnings: string[];
}

export interface KnowledgeOutputEdge {
  tempId: string;
  fromTempId: string;
  toTempId: string;
  type: string;
  label: string;
  confidence: number;
}

/**
 * Document grade — frontmatter 완비도에 따른 처리 등급. 신규 ontology 추출
 * 워커 (T-4) 출력에만 존재. legacy Gemini 출력은 undefined.
 */
export type KnowledgeOutputGrade = 'A' | 'B' | 'C';

/**
 * LLM token usage + cost — 신규 ontology 추출 출력에만 존재.
 * C-1 cutover 단가 ≤ $0.05/page 추적용 1차 데이터.
 */
export interface KnowledgeOutputUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number;
}

export interface KnowledgeOutput {
  id: string;
  accountId?: string;
  jobId: string;
  documentId: string;
  documentVersionId: string;
  extractorVersion: string;
  /** 'gemini' | 'stub' | 'stub-fallback' | 'anthropic'. */
  provider: string;
  summary: string;
  nodeCount: number;
  edgeCount: number;
  warningCount: number;
  nodes: KnowledgeOutputNode[];
  edges: KnowledgeOutputEdge[];
  warnings: string[];
  /** ontology 추출 (provider='anthropic') 의 frontmatter 등급. */
  grade?: KnowledgeOutputGrade;
  /** ontology 추출의 LLM 사용량·단가. */
  usage?: KnowledgeOutputUsage;
  /** validator 가 drop 한 항목 수 (ontology 추출만). 검수자가 부분 실패를 인지하도록. */
  validationErrorCount?: number;
  /** ontology 추출의 wall-clock latency (ms). */
  latencyMs?: number;
  createdAt: Date;
}
