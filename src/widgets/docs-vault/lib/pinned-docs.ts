// 고정 (pinned) 문서 slug 목록을 localStorage 에 저장. 볼트별 namespace
// 분리 (recent-docs 와 동일 패턴). 개수 제한 없음, 순서 = 고정한 순.

import type { VaultRecentKey } from './recent-docs';

export const PINNED_DOCS_STORAGE_PREFIX = 'aslan:docs-vault:pinned:v1:';
const STORAGE_PREFIX = PINNED_DOCS_STORAGE_PREFIX;

function storageKey(key: VaultRecentKey): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function readPinnedDocs(key: VaultRecentKey): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function writePinned(key: VaultRecentKey, list: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(list));
  } catch {
    /* private mode — ignore */
  }
}

export function isPinned(key: VaultRecentKey, slug: string): boolean {
  return readPinnedDocs(key).includes(slug);
}

/** toggle pin. 고정 추가 시 맨 앞에 insert, 해제 시 제거. 최신 리스트 반환. */
export function togglePinnedDoc(
  key: VaultRecentKey,
  slug: string,
): string[] {
  const current = readPinnedDocs(key);
  const idx = current.indexOf(slug);
  let next: string[];
  if (idx === -1) {
    next = [slug, ...current];
  } else {
    next = current.filter((s) => s !== slug);
  }
  writePinned(key, next);
  return next;
}
