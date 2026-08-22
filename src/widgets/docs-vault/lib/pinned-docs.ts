// Pinned document slugs kept in localStorage, namespaced per vault (the same
// pattern as recent-docs). No count limit; order = the order they were pinned.

import type { VaultRecentKey } from './recent-docs';

export const PINNED_DOCS_STORAGE_PREFIX = 'demo:docs-vault:pinned:v1:';
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

/** Toggle a pin. Pinning inserts at the front, unpinning removes. Returns the updated list. */
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
