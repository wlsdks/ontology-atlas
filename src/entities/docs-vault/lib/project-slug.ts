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
  return findProjectDocInList(manifest.docs, slug);
}

/**
 * 매니페스트 없이 `VaultDoc[]` 만 들고 있는 표면(/projects 카드 등)이 쓰는
 * 같은 역참조 — 반드시 이 함수를 거친다.
 *
 * 실측 결함(2026-07-26): /projects 카드가 `docs.find(d => d.slug ===
 * project.slug)` 로 직접 찾았다. `VaultDoc.slug` 는 **파일 경로 기반**
 * (`ontology/project`)이고 `Project.slug` 는 **frontmatter `slug:`**
 * (`ontology-atlas`)라, frontmatter 로 slug 를 명시한 프로젝트는 문서를
 * 영영 못 찾았다. 그래서 카드는 "설명이 아직 없는 프로젝트입니다" 를
 * 띄우는데 상세 화면엔 한 줄 설명이 멀쩡히 있었다 — 같은 프로젝트를 두
 * 화면이 다르게 말한 것이다. 판정을 한 함수로 모아 재발을 막는다.
 */
export function findProjectDocInList(
  docs: readonly VaultDoc[],
  slug: string,
): VaultDoc | null {
  for (const doc of docs) {
    if (!isProjectVaultDoc(doc)) continue;
    if (computeProjectSlug(doc) === slug) return doc;
  }
  return null;
}
