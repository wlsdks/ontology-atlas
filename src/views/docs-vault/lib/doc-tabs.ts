/**
 * Open document tabs: pure state plus localStorage. A working set, not a mode; the
 * URL `?slug=` is the active source of truth. Tabs persist across app restarts by owner decision.
 */

export interface DocTab {
  slug: string;
  title: string;
  lastActivatedAt: number;
}

/** A proliferation guard; past it, LRU evicts. */
export const DOC_TABS_MAX = 8;

const DOC_TABS_KEY_PREFIX = "docsVault:openTabs:";
const DOC_ACTIVE_TAB_KEY_PREFIX = "docsVault:activeTab:";

/** One key per vault, so sample tabs never leak into a local vault. */
export function docTabsStorageKey(sourceKey: string): string {
  return `${DOC_TABS_KEY_PREFIX}${sourceKey}`;
}

export function activeDocTabStorageKey(sourceKey: string): string {
  return `${DOC_ACTIVE_TAB_KEY_PREFIX}${sourceKey}`;
}

function isDocTab(value: unknown): value is DocTab {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === "string" &&
    typeof v.title === "string" &&
    typeof v.lastActivatedAt === "number"
  );
}

/** Corrupt or absent yields []. */
export function readStoredDocTabs(sourceKey: string): DocTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(docTabsStorageKey(sourceKey));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDocTab);
  } catch {
    return [];
  }
}

export function storeDocTabs(sourceKey: string, tabs: DocTab[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(docTabsStorageKey(sourceKey), JSON.stringify(tabs));
  } catch {
    // private mode / quota: the next session refills it
  }
}

export function readStoredActiveDocSlug(sourceKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const slug = window.localStorage.getItem(activeDocTabStorageKey(sourceKey));
    return slug && slug.trim() ? slug : null;
  } catch {
    return null;
  }
}

export function storeActiveDocSlug(sourceKey: string, slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(activeDocTabStorageKey(sourceKey), slug);
  } catch {
    // private mode / quota: fall back to the tab list's lastActivatedAt
  }
}

/** Returns the same reference when nothing is removed, avoiding a re-render. */
export function pruneMissingDocTabs(
  tabs: DocTab[],
  validSlugs: ReadonlySet<string>,
): DocTab[] {
  const next = tabs.filter((tab) => validSlugs.has(tab.slug));
  return next.length === tabs.length ? tabs : next;
}

/**
 * Only without a URL deeplink. The explicitly selected active slug wins; otherwise the
 * tabs' `lastActivatedAt` is the fallback.
 */
export function resolveRestoredActiveDocSlug({
  tabs,
  validSlugs,
  querySlug,
  storedActiveSlug = null,
}: {
  tabs: readonly DocTab[];
  validSlugs: ReadonlySet<string>;
  querySlug: string | null;
  storedActiveSlug?: string | null;
}): string | null {
  if (querySlug) return null;
  if (storedActiveSlug && validSlugs.has(storedActiveSlug)) {
    return storedActiveSlug;
  }
  let latest: DocTab | null = null;
  for (const tab of tabs) {
    if (!validSlugs.has(tab.slug)) continue;
    if (!latest || tab.lastActivatedAt > latest.lastActivatedAt) latest = tab;
  }
  return latest?.slug ?? null;
}

function evictLru(tabs: DocTab[], max: number): DocTab[] {
  if (tabs.length <= max) return tabs;
  const next = tabs.slice();
  while (next.length > max) {
    let oldestIndex = 0;
    for (let i = 1; i < next.length; i += 1) {
      if (next[i].lastActivatedAt < next[oldestIndex].lastActivatedAt) {
        oldestIndex = i;
      }
    }
    next.splice(oldestIndex, 1);
  }
  return next;
}

/** A newly opened or activated tab carries the newest timestamp, so the same call never evicts it. */
export function openOrActivateDocTab(
  tabs: DocTab[],
  next: { slug: string; title: string },
  now: number = Date.now(),
): DocTab[] {
  const idx = tabs.findIndex((tab) => tab.slug === next.slug);
  if (idx >= 0) {
    const updated = tabs.slice();
    updated[idx] = { ...updated[idx], title: next.title, lastActivatedAt: now };
    return updated;
  }
  const added = [...tabs, { slug: next.slug, title: next.title, lastActivatedAt: now }];
  return evictLru(added, DOC_TABS_MAX);
}

export interface CloseDocTabResult {
  tabs: DocTab[];
  /** Null when no tabs remain; the caller falls back to the first document or README. */
  nextActiveSlug: string | null;
}

/**
 * Closing the active tab moves left first, then right; closing the last yields null and the
 * caller falls back.
 */
export function closeDocTab(
  tabs: DocTab[],
  slug: string,
  activeSlug: string | null,
): CloseDocTabResult {
  const idx = tabs.findIndex((tab) => tab.slug === slug);
  if (idx === -1) return { tabs, nextActiveSlug: activeSlug };

  const nextTabs = [...tabs.slice(0, idx), ...tabs.slice(idx + 1)];

  if (activeSlug !== slug) {
    return { tabs: nextTabs, nextActiveSlug: activeSlug };
  }
  if (nextTabs.length === 0) {
    return { tabs: nextTabs, nextActiveSlug: null };
  }
  const leftNeighbor = idx > 0 ? tabs[idx - 1] : null;
  const rightNeighbor = idx < tabs.length - 1 ? tabs[idx + 1] : null;
  const neighbor = leftNeighbor ?? rightNeighbor;
  return { tabs: nextTabs, nextActiveSlug: neighbor?.slug ?? null };
}
