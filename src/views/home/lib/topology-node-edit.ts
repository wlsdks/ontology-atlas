import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * S1.1 — 토폴로지 노드 인라인 편집의 순수 모델.
 *
 * 토폴로지(`/topology`)를 온톨로지의 1차 *편집* surface 로 만드는 첫 단계.
 * 선택된 노드를 그 노드의 vault `.md` 문서로 해석한다 — full-detail A1 의
 * 본문(explanationEdit) 인라인 편집이 이 해석을 소비한다.
 *
 * UI/IO 무관 순수 함수라 vault 없이도 단위 test 가능.
 */

export interface TopologyNodeEditTarget {
  /** 편집 대상 vault 문서 slug (= 노드 sourceSlug). */
  vaultSlug: string;
  /** 동시편집 conflict guard 용 — updateFrontmatter 의 expectedMtime 으로 전달. */
  mtime: number | undefined;
  /** 현재 frontmatter — 편집 전 값 비교 기준. */
  frontmatter: Record<string, unknown>;
}

interface VaultDocLite {
  slug: string;
  mtime?: number;
  frontmatter?: Record<string, unknown>;
}

/**
 * 선택된 토폴로지 노드를 편집 가능한 vault 문서로 해석.
 *
 * `node.evidenceIds[0]` = 그 노드의 sourceSlug(= 자기 `.md` 문서 slug,
 * `derivationToInsight` 가 채움). 매칭되는 vault 문서가 없으면 null —
 * 합성 stub(자체 문서 없음) · static 데모 · vault 미선택이면 편집 불가.
 */
export function resolveTopologyNodeEditTarget(
  node: Pick<KnowledgeGraphNode, "evidenceIds">,
  docs: readonly VaultDocLite[],
): TopologyNodeEditTarget | null {
  const slug = node.evidenceIds[0];
  if (!slug) return null;
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return null;
  return {
    vaultSlug: doc.slug,
    mtime: doc.mtime,
    frontmatter: doc.frontmatter ?? {},
  };
}
