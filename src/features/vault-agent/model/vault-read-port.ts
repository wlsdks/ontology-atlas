import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

/**
 * 실행기가 볼트를 보는 **유일한 창.**
 *
 * 이 타입에 **쓰기 메서드가 없다는 것**이 "모델의 write 호출은 디스크에 닿지
 * 않는다" 의 구조적 증명이다. 실행기는 이 포트만 주입받으므로, 실수로 쓰기를
 * 부르려 해도 부를 함수 자체가 없다. 적용은 별도 모듈(`proposal-applier`)이
 * 동의 카드 핸들러에서만 한다.
 *
 * 새 메서드를 더할 때 여기에 쓰기를 넣지 마라 — 넣는 순간 그 증명이 사라지고
 * `tool-executor.test.ts` 의 타입 수준 단언이 깨진다.
 */
export interface VaultReadDoc {
  slug: string;
  path: string;
  title: string;
  kind: string;
  domain?: string;
  frontmatter: Record<string, unknown>;
  /** 본문 첫 단락 발췌 (200자 안). */
  excerpt: string;
  /** 파일 mtime(ms). 없으면 undefined — 동시 수정 가드를 걸 수 없다는 사실. */
  mtime?: number;
}

export interface VaultReadPort {
  /** 문서를 가진 개념들 + 다른 문서에서 이름만 불린 개념들. */
  readonly nodes: readonly KnowledgeGraphNode[];
  readonly edges: readonly KnowledgeGraphEdge[];
  /** 실제 `.md` 문서만. 이름만 불린 개념은 여기 없다. */
  readonly docs: readonly VaultReadDoc[];
  /** 문서 전문. 없으면 null. */
  readDocText(slug: string): Promise<string | null>;
}
