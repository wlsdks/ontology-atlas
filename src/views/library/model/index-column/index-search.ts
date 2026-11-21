import type { LibrarySourceRow } from "@/entities/docs-vault";

import { isIndexedSource, type SourceSearchState } from "../../lib/sources/use-source-search";

export interface SourceSearchEvidence {
  phase: SourceSearchState["phase"];
  hits: SourceSearchState["hits"];
  read: SourceSearchState["read"];
}

export interface SourceListFilter {
  includes: (row: LibrarySourceRow) => boolean;
}

/**
 * The sources a lowercase `needle` leaves: a path match survives because it works while files are
 * still being read. An unread file stays until its own read says otherwise, so the list narrows as
 * reads land. Without a needle the input array itself comes back, so memoised callers keep identity.
 */
export function sourcesMatching(
  sources: readonly LibrarySourceRow[],
  needle: string,
  search: SourceSearchEvidence,
  indexedPaths: ReadonlySet<string> | null,
): readonly LibrarySourceRow[] {
  if (!needle) return sources;
  return sources.filter(
    (row) =>
      row.path.toLowerCase().includes(needle) ||
      search.hits.has(row.path) ||
      (indexedPaths?.has(row.path) ?? false) ||
      (search.phase === "reading" && !isIndexedSource(row.path) && !search.read.has(row.path)),
  );
}

interface SearchablePage {
  slug: string;
  title: string;
  summary?: string | null;
  tags?: readonly string[] | null;
}

/** The pages a lowercase `needle` leaves: title, summary, tags, or text the app's index matched. */
export function pagesMatching<Page extends SearchablePage>(
  pages: readonly Page[],
  needle: string,
  indexedPaths: ReadonlySet<string> | null,
): readonly Page[] {
  if (!needle) return pages;
  return pages.filter(
    (page) =>
      page.title.toLowerCase().includes(needle) ||
      (page.summary ?? "").toLowerCase().includes(needle) ||
      (page.tags ?? []).some((tag) => tag.toLowerCase().includes(needle)) ||
      (indexedPaths?.has(`${page.slug}.md`) ?? false),
  );
}

/** What a state pressed in the progress band and a group picked on the Sources home leave of the list. */
export function narrowSources(
  sources: readonly LibrarySourceRow[],
  stateFilter: LibrarySourceRow["state"] | null,
  groupFilter: SourceListFilter | null,
): readonly LibrarySourceRow[] {
  if (!stateFilter && !groupFilter) return sources;
  return sources.filter((row) => (!stateFilter || row.state === stateFilter) && (!groupFilter || groupFilter.includes(row)));
}
