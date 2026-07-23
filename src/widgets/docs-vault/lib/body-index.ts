import type { VaultDoc } from '@/entities/docs-vault';

/**
 * 팔레트 본문 검색용 인메모리 인덱스 단위.
 *
 * - `raw` — frontmatter 를 벗긴 본문 원문 (스니펫 표시용).
 * - `lower` — 소문자 정규화본. 키스트로크당 재정규화(305 docs × ~6KB ≈
 *   1.2ms/키)를 피하려고 인덱스 시점에 1회만 lower 한다 — 사전 정규화 후
 *   선형 `indexOf` 스캔은 실측 ~0.1–0.2ms/키라 역색인 없이 충분.
 * - `key` — {@link docBodyCacheKey} 값. mtime 이 같으면 재독 skip.
 *
 * 주의: raw/lower 는 같은 길이라는 전제(오프셋 호환)로 스니펫을 자른다.
 * toLowerCase 가 길이를 바꾸는 극소수 유니코드(İ 등)에선 하이라이트가
 * 한두 글자 밀릴 수 있다 — 검색 자체는 영향 없음.
 */
export interface DocsBodyEntry {
  raw: string;
  lower: string;
  key: string;
}

export type DocsBodyIndex = ReadonlyMap<string, DocsBodyEntry>;

/**
 * 선두 frontmatter 블록 제거. title/tags 는 이미 메타데이터 티어에서
 * 검색되므로 본문 인덱스에서 이중 카운트하지 않는다. DocsVaultViewer 의
 * 렌더 전처리와 같은 규칙 (`^---…\n---`).
 */
export function stripFrontmatterBlock(text: string): string {
  if (!text.startsWith('---')) return text;
  return text.replace(/^---[\s\S]*?\n---\n?/, '').replace(/^\r?\n+/, '');
}

export function buildBodyEntry(rawFileText: string, key: string): DocsBodyEntry {
  const raw = stripFrontmatterBlock(rawFileText);
  return { raw, lower: raw.toLowerCase(), key };
}

/**
 * 문서별 캐시 키 — 로컬 볼트는 mtime(파일 lastModified), static 볼트는
 * updatedAt(빌드 시점 산출)로 변경을 감지한다. 폴링 diff 재빌드 후에도
 * 안 바뀐 문서는 본문 재독을 건너뛰게 하는 근거.
 */
export function docBodyCacheKey(doc: VaultDoc): string {
  return `${doc.slug}@${doc.mtime ?? doc.updatedAt}`;
}
