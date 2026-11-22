const MAX_PINNED_STORED = 500;

/** Reads a saved slug list; anything that is not a JSON array of strings reads as empty. */
export function readStoredSlugs(key: string, limit: number): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string").slice(0, limit);
  } catch {
    return [];
  }
}

/** Same behaviour as the docs-vault widget's togglePinnedDoc: pinning inserts at the front. */
export function togglePinnedInStorage(pinnedKey: string, slug: string): string[] {
  if (typeof window === "undefined") return [];
  const current = readStoredSlugs(pinnedKey, MAX_PINNED_STORED);
  const next = current.includes(slug)
    ? current.filter((pinnedSlug) => pinnedSlug !== slug)
    : [slug, ...current];
  try {
    window.localStorage.setItem(pinnedKey, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}
