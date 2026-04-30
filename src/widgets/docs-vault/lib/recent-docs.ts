// 최근 열어본 문서 slug 를 localStorage 에 5개까지 유지. 옵시디언 "Recent
// files" 와 동등. 볼트별로 namespace 분리 — 서버 볼트와 로컬 볼트(폴더별)
// 각각 독립된 리스트. slug 충돌 시 엉키는 문제 방지.

export const RECENT_DOCS_STORAGE_PREFIX = 'aslan:docs-vault:recent:v2:';
const STORAGE_PREFIX = RECENT_DOCS_STORAGE_PREFIX;
const MAX_RECENTS = 5;

/**
 * 볼트 namespace key.
 *  - 서버 볼트: 'server'
 *  - 로컬 볼트: 'local:{폴더이름}'
 * 폴더 이름만으로 구분하므로 동명의 폴더를 여러 개 등록하면 섞일 수 있으나
 * 실사용에선 드문 edge case. 필요해지면 IDB key 기반 UUID 도입.
 */
export type VaultRecentKey = 'server' | `local:${string}`;

function storageKey(key: VaultRecentKey): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function readRecentDocs(key: VaultRecentKey): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function pushRecentDoc(
  key: VaultRecentKey,
  slug: string,
): string[] {
  if (typeof window === 'undefined') return [];
  const current = readRecentDocs(key).filter((s) => s !== slug);
  const next = [slug, ...current].slice(0, MAX_RECENTS);
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(next));
  } catch {
    /* private mode — ignore */
  }
  return next;
}

/** v1 에서 쓰던 단일 키를 v2 namespace 로 마이그레이트. 처음 1회만 수행. */
export function migrateLegacyRecentDocs(): void {
  if (typeof window === 'undefined') return;
  const LEGACY = 'aslan:docs-vault:recent:v1';
  try {
    const raw = window.localStorage.getItem(LEGACY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(LEGACY);
      return;
    }
    const slugs = parsed
      .filter((x): x is string => typeof x === 'string')
      .slice(0, MAX_RECENTS);
    // 기존 단일 리스트는 서버 볼트용으로 간주 — 그 당시 로컬 볼트가
    // 없었으므로 안전한 가정.
    const targetKey = storageKey('server');
    if (!window.localStorage.getItem(targetKey) && slugs.length > 0) {
      window.localStorage.setItem(targetKey, JSON.stringify(slugs));
    }
    window.localStorage.removeItem(LEGACY);
  } catch {
    /* ignore */
  }
}
