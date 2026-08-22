/**
 * Open document tabs — pure state logic plus localStorage persistence.
 *
 * A tab is a "working set", not a "mode": the source of truth for the active tab is the URL
 * `?slug=` (the same principle as the other UI state in `persistence.ts`), and this module
 * manages only the list of open slugs plus each tab's last activation time. `DocsVaultPage`
 * wires it by observing `selectedSlug` changes and calling `openOrActivateDocTab` — it never
 * fights the URL.
 *
 * **Owner decision (2026-07):** tab lifetime is permanent in localStorage — "still there after
 * restarting the macOS app" (overriding the draft contract's sessionStorage proposal).
 */

export interface DocTab {
  slug: string;
  title: string;
  lastActivatedAt: number;
}

/** The tab ceiling — a proliferation guard (owner's concern: "top-level mode tabs multiplying"). Over it, LRU evicts. */
export const DOC_TABS_MAX = 8;

const DOC_TABS_KEY_PREFIX = "docsVault:openTabs:";
const DOC_ACTIVE_TAB_KEY_PREFIX = "docsVault:activeTab:";

/** Keys are separated per vault (sourceKey), so sample tabs never leak into a local vault. */
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

/** Reads the tab list for a sourceKey from localStorage. Corrupt or absent yields []. */
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
    /* private mode / quota — skip; the next session simply refills it */
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
    /* private mode / quota — fall back to the tab list's lastActivatedAt */
  }
}

/**
 * Silently drops restored tabs whose slug no longer exists (renamed or deleted documents). When
 * nothing is removed the original reference is returned as-is, avoiding a needless re-render.
 */
export function pruneMissingDocTabs(
  tabs: DocTab[],
  validSlugs: ReadonlySet<string>,
): DocTab[] {
  const next = tabs.filter((tab) => validSlugs.has(tab.slug));
  return next.length === tabs.length ? tabs : next;
}

/**
 * Restores the previously active document only when an app restart or vault switch has no URL
 * deeplink. The active slug saved from an explicit selection wins; if there is none, or it no
 * longer exists in the current vault, the tabs' `lastActivatedAt` is the safe fallback.
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

/** Past eight, evict from the least recently activated tab (LRU). */
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

/**
 * The side effect of selecting a document — already open means activate (and refresh the title);
 * otherwise append a new tab and evict past the `DOC_TABS_MAX` ceiling by LRU. A newly opened or
 * activated tab always carries the newest timestamp, so it can never be evicted by the same call.
 */
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
  /** null = there are zero tabs — the caller falls back to "the first document in the list, or README". */
  nextActiveSlug: string | null;
}

/**
 * Closes a tab.
 * - Closing a non-active tab leaves the active selection untouched.
 * - Closing the active tab moves to an adjacent one — **left first**, or right when there is no
 *   left (the leftmost tab was closed).
 * - Closing the last remaining tab yields `nextActiveSlug: null`; the fallback (the first
 *   document in the list, or README) is the caller's responsibility.
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
