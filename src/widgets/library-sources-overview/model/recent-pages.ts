import type { LibraryWikiPage } from "@/entities/docs-vault";
import { recordedLocalDay } from "@/shared/lib/library/recorded-date";

export const RECENT_PAGE_COUNT = 5;

export interface RecentPage {
  page: LibraryWikiPage;
  /** Local day number of the page's `compiled_at`. */
  day: number;
}

export interface RecentPages {
  /** Newest first, at most `RECENT_PAGE_COUNT`. */
  pages: readonly RecentPage[];
  /** Whether the folder holds any wiki page at all, dated or not. */
  anyPage: boolean;
}

function newer(a: RecentPage, b: RecentPage): boolean {
  if (a.day !== b.day) return a.day > b.day;
  const at = a.page.compiledAt ?? "";
  const bt = b.page.compiledAt ?? "";
  return at !== bt ? at > bt : a.page.slug < b.page.slug;
}

/**
 * The five pages with the latest believed `compiled_at`: a date after `today` or before 2000 is not
 * believed, and an undated page never enters. One pass over P pages keeping a five-slot list: O(P).
 */
export function selectRecentPages(
  pages: readonly LibraryWikiPage[],
  today: number,
  offsetMinutes?: (epochMs: number) => number,
): RecentPages {
  const top: RecentPage[] = [];
  for (const page of pages) {
    if (!page.compiledAt) continue;
    const day = recordedLocalDay(page.compiledAt, offsetMinutes);
    if (day === null || day > today) continue;
    const candidate = { page, day };
    if (top.length === RECENT_PAGE_COUNT && !newer(candidate, top[top.length - 1]!)) continue;
    let at = top.length;
    while (at > 0 && newer(candidate, top[at - 1]!)) at -= 1;
    top.splice(at, 0, candidate);
    if (top.length > RECENT_PAGE_COUNT) top.pop();
  }
  return { pages: top, anyPage: pages.length > 0 };
}
