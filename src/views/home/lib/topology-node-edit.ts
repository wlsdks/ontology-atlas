import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * S1.1 — 토폴로지 노드 인라인 편집의 순수 모델.
 *
 * 토폴로지(`/topology`)를 온톨로지의 1차 *편집* surface 로 만드는 첫 단계.
 * 선택된 노드를 그 노드의 vault `.md` 문서로 해석하고, 사용자가 바꾼 값
 * (domain/kind 등 frontmatter 키)을 `useLocalVault().updateFrontmatter` 가
 * 받는 `updates` 형태로 변환한다. *기존 본문은 보존* — frontmatter 키만 patch.
 *
 * UI/IO 무관 순수 함수라 vault 없이도 단위 test 가능. drawer wiring(IO)은
 * 이 모델을 소비한다.
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

/**
 * 편집 입력을 `updateFrontmatter` 의 `updates` 로 변환.
 *
 * - 값 trim. 빈 문자열 → `null`(키 삭제). 현재값과 같으면 omit(불필요한 write 회피).
 * - `changed === false` 면 호출자가 저장 자체를 skip.
 *
 * 반환 타입은 `Record<string, string | null>` — `FrontmatterUpdateValue` 의
 * 부분집합이라 feature 내부 타입에 결합하지 않으면서 updateFrontmatter 에 그대로 전달 가능.
 */
export function buildNodeFrontmatterEdit(
  current: Record<string, unknown>,
  edits: Record<string, string>,
): { updates: Record<string, string | null>; changed: boolean } {
  const updates: Record<string, string | null> = {};
  let changed = false;
  for (const [key, rawNext] of Object.entries(edits)) {
    const next = rawNext.trim();
    const currRaw = current[key];
    const curr = typeof currRaw === "string" ? currRaw.trim() : "";
    if (next === curr) continue;
    updates[key] = next === "" ? null : next;
    changed = true;
  }
  return { updates, changed };
}
