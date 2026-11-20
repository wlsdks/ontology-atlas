import { useCallback, useMemo } from "react";

import type { LibraryOriginalLink, LibraryWriteUpLink, VaultDoc } from "@/entities/docs-vault";
import { pageNeighbours, readerLinkTargets } from "./wiki-reader-facts";

/**
 * What the open page's reader knows about it from the listing in memory: link titles, the pages
 * and concepts around it, and which of its sources changed after it was written. Opening a page
 * reads no other page.
 */
export function useWikiReaderFacts({ docs, locale, page, originals, writeUps }: {
  docs: readonly VaultDoc[];
  locale: string;
  page: VaultDoc | null;
  originals: readonly LibraryOriginalLink[];
  writeUps: ReadonlyMap<string, readonly LibraryWriteUpLink[]>;
}) {
  const linkTargets = useMemo(() => readerLinkTargets(docs, locale), [docs, locale]);
  const neighbours = useMemo(
    () => (page ? pageNeighbours(page.slug, docs, linkTargets) : null),
    [docs, linkTargets, page],
  );
  const slug = page?.slug ?? null;
  const sourceChangedSince = useCallback(
    (path: string) => writeUps.get(path)?.some((up) => up.slug === slug && up.freshness === "behind") ?? false,
    [slug, writeUps],
  );
  const selectedSourceChanged = useMemo(
    () => originals.some((original) => sourceChangedSince(original.path)),
    [originals, sourceChangedSince],
  );
  return { linkTargets, neighbours, sourceChangedSince, selectedSourceChanged };
}
