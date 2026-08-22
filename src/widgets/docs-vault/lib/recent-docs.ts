// The slugs of up to 5 recently opened documents, kept in localStorage —
// equivalent to Obsidian's "Recent files". Namespaced per vault so a server vault
// and each local folder keep independent lists and slug collisions cannot tangle.

export const RECENT_DOCS_STORAGE_PREFIX = 'demo:docs-vault:recent:v2:';
const STORAGE_PREFIX = RECENT_DOCS_STORAGE_PREFIX;
const MAX_RECENTS = 5;

/**
 * Vault namespace key.
 *  - server vault: 'server'
 *  - local vault: 'local:{folder name}'
 * Only the folder name distinguishes them, so registering several folders of the
 * same name can mix them — a rare edge case in practice. Introduce an IDB-key UUID
 * if it ever matters.
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

/** Migrate the single key used in v1 to the v2 namespace. Runs once. */
export function migrateLegacyRecentDocs(): void {
  if (typeof window === 'undefined') return;
  const LEGACY = 'demo:docs-vault:recent:v1';
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
    // The old single list is treated as the server vault's — local vaults did not
    // exist at the time, so that is a safe assumption.
    const targetKey = storageKey('server');
    if (!window.localStorage.getItem(targetKey) && slugs.length > 0) {
      window.localStorage.setItem(targetKey, JSON.stringify(slugs));
    }
    window.localStorage.removeItem(LEGACY);
  } catch {
    /* ignore */
  }
}
