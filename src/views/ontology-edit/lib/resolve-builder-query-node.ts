import { resolveOntologyBuilderNodeSlugFromGraphId } from "@/entities/knowledge-graph";

interface BuilderQueryDoc {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

/**
 * 빌더 `?node=` 수신부 — URL 계약(H5)의 공통 id 문법 canonical `<kind>:<slug>`
 * 를 1급으로 받는다. 발신부(`buildOntologyBuilderNodeHrefFromGraphId`)가 이제
 * canonical 을 실어 보내므로, 그 문법이 어떤 라이브/도그푸드 doc slug 와도 맞도록
 * 먼저 canonical → 복수-슬래시 vault 폴더형으로 정규화한 뒤 매칭한다
 * (`resolveOntologyBuilderNodeSlugFromGraphId`: `capability:foo` → `capabilities/foo`,
 * 복수-슬래시/evidence-path 는 통과). 정규화 결과가 안 맞으면 raw 로도 한 번 더
 * 시도해 예전 공유 링크(`?node=capabilities/foo`, `?node=domains/views`)를 깨지
 * 않는 레거시 별칭으로 유지한다.
 */
export function resolveBuilderQueryNodeSlug(
  queryNodeId: string | null,
  docs: readonly BuilderQueryDoc[],
): string | null {
  const raw = queryNodeId?.trim().replace(/^\/+/, "");
  if (!raw) return null;

  // canonical `<kind>:<slug>` → 복수-슬래시 vault 폴더형으로 정규화(slash·bare 는
  // 그대로). 그런 뒤 아래 매칭이 라이브 slug·`ontology/` prefix·frontmatter slug
  // 세 경로로 doc 을 찾는다. canonical 을 먼저, raw 를 fallback 으로 시도한다.
  const canonicalized = resolveOntologyBuilderNodeSlugFromGraphId(raw);
  return matchBuilderDocSlug(canonicalized, docs) ?? matchBuilderDocSlug(raw, docs);
}

function matchBuilderDocSlug(
  normalized: string,
  docs: readonly BuilderQueryDoc[],
): string | null {
  if (!normalized) return null;

  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  if (bySlug.has(normalized)) return normalized;

  const unprefixed = normalized.replace(/^ontology\//, "");
  const ontologyPrefixed = `ontology/${unprefixed}`;
  if (bySlug.has(ontologyPrefixed)) return ontologyPrefixed;

  const frontmatterMatch = docs.find((doc) => {
    const frontmatterSlug = doc.frontmatter?.slug;
    if (typeof frontmatterSlug !== "string") return false;
    const normalizedFrontmatterSlug = frontmatterSlug.replace(/^ontology\//, "");
    return (
      frontmatterSlug === normalized ||
      frontmatterSlug === ontologyPrefixed ||
      normalizedFrontmatterSlug === unprefixed
    );
  });

  return frontmatterMatch?.slug ?? null;
}
