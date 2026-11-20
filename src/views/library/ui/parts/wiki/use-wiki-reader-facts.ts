import { useCallback, useMemo } from "react";

import type { LibraryOriginalLink, VaultDoc } from "@/entities/docs-vault";
import { changedSinceWritten, pageNeighbours, readerLinkTargets, recordedSourceHashes } from "./wiki-reader-facts";

/**
 * What the open page's reader knows about it from the listing in memory: link titles, the pages
 * and concepts around it, and which of its sources changed after it was written. Opening a page
 * reads no other page.
 */
export function useWikiReaderFacts({ docs, locale, page, originals, hashes }: {
  docs: readonly VaultDoc[];
  locale: string;
  page: VaultDoc | null;
  originals: readonly LibraryOriginalLink[];
  /** The sha256 of each source's bytes as last measured, by path. */
  hashes: ReadonlyMap<string, string>;
}) {
  const linkTargets = useMemo(() => readerLinkTargets(docs, locale), [docs, locale]);
  const neighbours = useMemo(
    () => (page ? pageNeighbours(page.slug, docs, linkTargets) : null),
    [docs, linkTargets, page],
  );
  const recorded = useMemo(() => recordedSourceHashes(page?.frontmatter ?? {}), [page]);
  const recordedHash = useCallback((path: string) => recorded.get(path.normalize("NFC")) ?? null, [recorded]);
  const sourceChangedSince = useCallback(
    (path: string) => changedSinceWritten(recordedHash(path), hashes.get(path)),
    [hashes, recordedHash],
  );
  const selectedSourceChanged = useMemo(
    () => originals.some((original) => sourceChangedSince(original.path)),
    [originals, sourceChangedSince],
  );
  return { linkTargets, neighbours, recordedHash, sourceChangedSince, selectedSourceChanged };
}
