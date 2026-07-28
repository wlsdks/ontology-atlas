import type { VaultDoc } from '@/entities/docs-vault';
import type { DocsVaultSource } from './persistence';

export type DocsVaultCollection = 'all' | 'guides' | 'ontology';

/** 실제 문서가 속하는 고유 컬렉션(전체 뷰 'all' 은 필터일 뿐 문서 속성 아님). */
export type DocsVaultDocCollection = Exclude<DocsVaultCollection, 'all'>;

const ONTOLOGY_KINDS = new Set(['project', 'domain', 'capability', 'element']);

function hasOntologyDescribes(frontmatter: Pick<VaultDoc, 'frontmatter'>['frontmatter']): boolean {
  return Array.isArray(frontmatter.describes) && frontmatter.describes.length > 0;
}

export function resolveDocsVaultCollection(
  doc: Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
): DocsVaultDocCollection {
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
  // 'all' 은 필터 없음 — 이 폴더의 모든 문서.
  if (collection === 'all') return docs;
  return docs.filter((doc) => resolveDocsVaultCollection(doc) === collection);
}

/**
 * 첫 화면이 열릴 컬렉션 — **자기가 가진 것을 보여준다**.
 *
 * 기본값 `'guides'` 는 "글부터 보여준다" 는 의도였지만, 그 컬렉션이 0건인
 * 볼트(이 저장소의 dogfood 샘플이 그렇다 — 전부 온톨로지 노드)에서는 볼트
 * 필이 "문서 31개" 라 말하는 동안 목록이 비어 있었다. 화면이 자기 상태에
 * 대해 거짓을 말한 것이라, 이건 취향이 아니라 정직성 결함이다.
 *
 * 볼트가 아예 비었을 때는 폴백하지 않는다 — `'all'` 로 바꿔도 여전히 0건이라
 * 상태만 흔들고 사용자에게 주는 것이 없다. 그 자리는 빈 상태 카피의 몫이다.
 */
export function resolveInitialDocsCollection<
  T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
>(docs: T[], preferred: DocsVaultDocCollection = 'guides'): DocsVaultCollection {
  if (docs.length === 0) return preferred;
  return filterDocsByCollection(docs, preferred).length > 0 ? preferred : 'all';
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
