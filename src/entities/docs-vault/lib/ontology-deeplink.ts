import type { VaultDoc } from "../model/types";

/**
 * frontmatter.kind 가 있는 문서는 deriveOntologyFromVault 가 동일 vault 의
 * ontology 그래프에 노드로 등재한다. 노드 ID 규칙은
 * \`${kind}:${doc.slug.split('/').pop()}\` — 본 helper 는 그 규칙을 깨지
 * 않도록 한 곳에서 관리해 docs viewer 등 다른 surface 가 ontology view
 * (\`/ontology/?node=...\`) 로 deeplink 를 만들 수 있게 한다.
 *
 * kind 가 비어있거나 slug 가 비어있으면 null. 코너 케이스 (`fm.slug` 가
 * filename 과 다른 경우) 에는 ontology 측에서 노드 매칭 실패해도 페이지는
 * graceful 로드되므로 호출자는 별도 가드 불필요.
 */
export function buildOntologyDeeplinkForDoc(doc: VaultDoc): string | null {
  const rawKind = doc.frontmatter?.kind;
  const kind = typeof rawKind === "string" ? rawKind.trim() : "";
  if (!kind) return null;
  const tail = doc.slug.split("/").pop() ?? doc.slug;
  if (!tail) return null;
  return `/ontology/?node=${encodeURIComponent(`${kind}:${tail}`)}`;
}
