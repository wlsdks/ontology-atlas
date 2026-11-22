export interface DocTab {
  slug: string;
  title: string;
  lastActivatedAt: number;
}

export const DOC_TABS_MAX = 8;

const DOC_TABS_KEY_PREFIX = "docsVault:openTabs:";
const DOC_ACTIVE_TAB_KEY_PREFIX = "docsVault:activeTab:";

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

export function pruneMissingDocTabs(
  tabs: DocTab[],
  validSlugs: ReadonlySet<string>,
): DocTab[] {
  const next = tabs.filter((tab) => validSlugs.has(tab.slug));
  return next.length === tabs.length ? tabs : next;
}

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

export function openOrActivateDocTab(
  tabs: DocTab[],
  next: { slug: string; title: string },
  now: number = Date.now(),
): DocTab[] {
  const index = tabs.findIndex((tab) => tab.slug === next.slug);
  if (index >= 0) {
    const updated = tabs.slice();
    updated[index] = { ...updated[index], title: next.title, lastActivatedAt: now };
    return updated;
  }
  const added = [...tabs, { slug: next.slug, title: next.title, lastActivatedAt: now }];
  return evictLru(added, DOC_TABS_MAX);
}

export interface CloseDocTabResult {
  tabs: DocTab[];
  nextActiveSlug: string | null;
}

export function closeDocTab(
  tabs: DocTab[],
  slug: string,
  activeSlug: string | null,
): CloseDocTabResult {
  const index = tabs.findIndex((tab) => tab.slug === slug);
  if (index === -1) return { tabs, nextActiveSlug: activeSlug };

  const nextTabs = [...tabs.slice(0, index), ...tabs.slice(index + 1)];

  if (activeSlug !== slug) {
    return { tabs: nextTabs, nextActiveSlug: activeSlug };
  }
  if (nextTabs.length === 0) {
    return { tabs: nextTabs, nextActiveSlug: null };
  }
  const leftNeighbor = index > 0 ? tabs[index - 1] : null;
  const rightNeighbor = index < tabs.length - 1 ? tabs[index + 1] : null;
  const neighbor = leftNeighbor ?? rightNeighbor;
  return { tabs: nextTabs, nextActiveSlug: neighbor?.slug ?? null };
}
