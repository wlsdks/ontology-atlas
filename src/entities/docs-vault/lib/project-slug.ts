import type { VaultDoc, VaultManifest } from "../model/types";

/**
 * vault doc → Project.slug 산정 — `fm.slug` 가 truthy 면 그것을 (앞뒤 공백
 * 제거), 그 외엔 파일 경로 기반 fileSlug:
 *   - `projects/foo` → `foo`
 *   - `ontology/project` → `project`
 *   - `bar` → `bar`
 *
 * deriveProjectsFromVault 와 buildTopologyDeeplinkForDoc 둘 다 같은 결과를
 * 내야 토폴로지 ?p= deeplink 가 drawer 를 정확히 연다. 한 곳만 갱신해 어긋
 * 나는 회귀를 방지하기 위해 본 helper 가 단일 source of truth.
 */
export function computeProjectSlug(doc: VaultDoc): string | null {
  const fm = doc.frontmatter ?? {};
  const fmSlugRaw = fm.slug;
  const fmSlug =
    typeof fmSlugRaw === "string" && fmSlugRaw.trim() ? fmSlugRaw.trim() : null;
  const fileSlug = doc.slug.startsWith("projects/")
    ? doc.slug.replace(/^projects\//, "")
    : doc.slug.split("/").pop() || doc.slug;
  return fmSlug ?? (fileSlug || null);
}

/**
 * deriveProjectsFromVault 과 동일한 project-doc 인식 기준 (frontmatter.kind
 * === 'project' 우선, 'projects/' path 는 legacy 호환). 두 곳에서 각자
 * 다시 적어 drift 나던 걸 단일화 — findProjectVaultDoc 도 이 helper 위에.
 */
export function isProjectVaultDoc(doc: VaultDoc): boolean {
  return doc.frontmatter?.kind === "project" || doc.slug.startsWith("projects/");
}

/**
 * Project.slug (frontmatter `slug:` 우선 산정값) 로 원본 VaultDoc 을 역참조.
 * 본문(raw markdown) 은 manifest 에 없고 content.json(static) / fileHandle
 * (local) 에 doc.slug(파일 경로) 키로 별도 존재 — 본문 lazy-load 의 첫 hop.
 */
export function findProjectVaultDoc(
  manifest: VaultManifest,
  slug: string,
): VaultDoc | null {
  for (const doc of manifest.docs) {
    if (!isProjectVaultDoc(doc)) continue;
    if (computeProjectSlug(doc) === slug) return doc;
  }
  return null;
}
