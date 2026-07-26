import type { KnowledgeGraphNode } from "../model/types";

/**
 * 노드의 첫 근거 slug 가 **자기 문서인지 남의 문서인지** 를 가르는 단일 출처.
 *
 * 왜 필요한가 — vault derive 는 노드를 두 경로로 만든다. frontmatter 에
 * `kind:` 가 있는 문서(자기 slug 를 근거로 가짐)와, 다른 문서의 관계 키
 * (`contains` / `relates` / `elements` …)에서 이름만 불린 파생 노드(자기를
 * 인용한 *남의* 문서 slug 를 근거로 가짐)다. 둘 다 `evidenceIds[0]` 한 칸에
 * 담기므로, "이 노드의 문서 열기" 를 그리는 표면이 그 값을 그대로 쓰면
 * 사용자는 방금 연 개념의 문서를 읽는다고 믿으면서 남의 문서를 보게 된다.
 *
 * 두 값을 나눠 돌려주므로 각 표면이 정직하게 고를 수 있다:
 * - `ownSlug` — 이 노드 자신의 `.md`. 없으면 null → "문서" 어포던스를 내지 않는다.
 * - `mentionedInSlug` — 이 노드를 적어 둔 다른 문서. 문서가 없을 때만 채워진다.
 *
 * 하위 호환: `hasOwnDocument` 미지정 노드(수동 조립 · 테스트 픽스처)는 종전대로
 * 자기 문서로 읽는다 — 새 필드를 모르는 생산 경로의 동작을 바꾸지 않는다.
 */
export function resolveNodeDocument(
  node: Pick<KnowledgeGraphNode, "evidenceIds" | "hasOwnDocument"> | null | undefined,
): { ownSlug: string | null; mentionedInSlug: string | null } {
  const slug = node?.evidenceIds?.[0] ?? null;
  if (!slug) return { ownSlug: null, mentionedInSlug: null };
  return node?.hasOwnDocument === false
    ? { ownSlug: null, mentionedInSlug: slug }
    : { ownSlug: slug, mentionedInSlug: null };
}
