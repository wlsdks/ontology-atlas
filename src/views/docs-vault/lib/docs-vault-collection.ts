import type { VaultDoc } from '@/entities/docs-vault';
import type { DocsVaultSource } from './persistence';

export type DocsVaultCollection = 'guides' | 'ontology';

const ONTOLOGY_KINDS = new Set(['project', 'domain', 'capability', 'element']);

function hasOntologyDescribes(frontmatter: Pick<VaultDoc, 'frontmatter'>['frontmatter']): boolean {
  return Array.isArray(frontmatter.describes) && frontmatter.describes.length > 0;
}

export function resolveDocsVaultCollection(
  doc: Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
): DocsVaultCollection {
  const kind = String(doc.frontmatter.kind ?? '');
  if (
    ONTOLOGY_KINDS.has(kind) ||
    hasOntologyDescribes(doc.frontmatter) ||
    doc.path.startsWith('docs/ontology/') ||
    doc.slug.startsWith('ontology/')
  ) {
    return 'ontology';
  }
  return 'guides';
}

export function filterDocsByCollection<T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>>(
  docs: T[],
  collection: DocsVaultCollection,
): T[] {
  return docs.filter((doc) => resolveDocsVaultCollection(doc) === collection);
}

export function buildTagIndexForDocs(docs: Pick<VaultDoc, 'slug' | 'tags'>[]): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  for (const doc of docs) {
    for (const tag of doc.tags) {
      tags[tag] = [...(tags[tag] ?? []), doc.slug];
    }
  }
  return tags;
}

export function resolveDocsVaultSlugAlias(
  slug: string | null,
  docs: Pick<VaultDoc, 'slug'>[],
): string | null {
  if (!slug) return null;
  const slugs = new Set(docs.map((doc) => doc.slug));
  if (slugs.has(slug)) return slug;

  if (slug.startsWith('ontology/')) {
    const localSlug = slug.slice('ontology/'.length);
    if (slugs.has(localSlug)) return localSlug;
  } else {
    const packagedSlug = `ontology/${slug}`;
    if (slugs.has(packagedSlug)) return packagedSlug;
  }

  return slug;
}

export function shouldDeferDocsVaultDefaultSelection({
  normalizedQuerySlug,
  selectedSlug,
  selectionReady = true,
}: {
  normalizedQuerySlug: string | null;
  selectedSlug: string | null;
  selectionReady?: boolean;
}): boolean {
  if (!selectionReady) return true;
  return Boolean(normalizedQuerySlug && selectedSlug !== normalizedQuerySlug);
}

/**
 * Toss D1 정리(2026-07) — 샘플(vault 미선택) 모드에서 명시적 딥링크
 * (`?slug=`) 없이 착지했을 때만 "이 문서함은 무엇이고 어떻게 쓰나" 소개
 * 노트를 보여준다. 기본 선택 로직(`README`/`FEATURES`/…)이 여전히
 * 100% 영어 개발 문서를 고르더라도, 이 노트가 그 위에서 먼저 맥락을
 * 준다 — 비개발자 방문자가 첫 화면에서 즉시 이탈하지 않도록.
 *
 * `dismissed` 는 caller(`DocsVaultPage`)가 사용자의 명시적 문서 선택
 * (사이드바 클릭·팔레트·탭 활성화 등, `handleSelect` 경유) 시 true 로
 * 넘긴다 — 한 번 실제 문서를 골랐다면 다시 밀어붙이지 않는다.
 */
export function shouldShowSampleWelcomeNote({
  source,
  normalizedQuerySlug,
  dismissed,
}: {
  source: DocsVaultSource;
  normalizedQuerySlug: string | null;
  dismissed: boolean;
}): boolean {
  return source === 'server' && !normalizedQuerySlug && !dismissed;
}
