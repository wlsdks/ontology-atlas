/**
 * Ontology extraction output shape — LLM 이 반환해야 하는 JSON.
 *
 * `knowledgeExtractionOutputs` 의 nodes / edges sub-schema 와 동일하지만
 * server 주입 필드 (id / jobId / documentId / createdAt 등) 는 제외.
 *
 * confidence 는 0~1 범위 값. T-7 정책에 따라:
 *   ≥ 0.85 high (자동 승인 후보)
 *   0.60 ~ 0.84 medium
 *   < 0.60 low (자동 반영 금지)
 */

import type { OntologyEdgeType, OntologyKind } from '@/shared/lib/ontology-frontmatter';

export interface ExtractionEvidenceRef {
  /** chunk ID (workers 가 주입). LLM 은 본문 인용으로 표시. */
  chunkRef?: string;
  /** 본문 내 인용 위치 (문자 단위). 모르면 생략. */
  charStart?: number;
  charEnd?: number;
  /** 표시용 발췌. 길이 ≤ 240. */
  excerpt: string;
}

export interface ExtractedNode {
  tempId: string;
  title: string;
  kind: OntologyKind;
  projectIds: string[];
  summary: string;
  confidence: number;
  warnings?: string[];
  /** kind=element 인 경우 권장. */
  elementType?: string;
  /** 본문 근거 — 최소 1 개 권장 (medium tier 이상은 필수). */
  evidence?: ExtractionEvidenceRef[];
}

export interface ExtractedEdge {
  tempId: string;
  fromTempId: string;
  toTempId: string;
  type: OntologyEdgeType;
  label?: string;
  confidence: number;
  warnings?: string[];
  evidence?: ExtractionEvidenceRef[];
}

export interface ExtractionOutput {
  summary: string;
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
  warnings: string[];
}

export interface ValidationFailure {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  value?: ExtractionOutput;
  errors: ValidationFailure[];
}
