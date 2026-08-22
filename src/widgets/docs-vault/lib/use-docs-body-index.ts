'use client';

import { useEffect, useRef, useState } from 'react';
import { type VaultDoc } from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import {
  buildBodyEntry,
  docBodyCacheKey,
  type DocsBodyEntry,
  type DocsBodyIndex,
} from './body-index';
import { fetchServerDocContent } from './server-doc-content';

/** How many body reads run at once — keeps FSA/fetch from stampeding. */
const READ_CONCURRENCY = 6;

/** The default delay that keeps index building from overlapping the initial render and the manifest build. */
const DEFAULT_START_DELAY_MS = 250;

interface Options {
  docs: VaultDoc[];
  /**
   * A local vault's slug → raw md reader (the same source as DocsVaultPage's viewer
   * resolver: FileSystemFileHandle.getFile().text()). Unset means a static vault,
   * falling back to the bundled content.json plus a `/docs-vault/{slug}.md` fetch —
   * the same priority as the viewer's body source.
   */
  getDocContent?: (slug: string) => Promise<string>;
  /** Test-only override of the build start delay. */
  startDelayMs?: number;
}

/**
 * The in-memory index the palette searches bodies with. When the vault loads (the
 * docs array is replaced) it reads and lowercases every body, and after a polling
 * diff rebuild it skips the re-read of any document whose {@link docBodyCacheKey}
 * (slug + mtime) is unchanged — only changed files are read again.
 *
 * Sense of scale: 305 docs × ~6KB × (raw + lower) ≈ 3.5MB of memory, and the build
 * I/O is the same order as the full-file read the manifest build already does.
 * Search itself is the linear scan in `search.ts` (~0.1–0.2ms/key measured).
 */
export function useDocsBodyIndex({
  docs,
  getDocContent,
  startDelayMs = DEFAULT_START_DELAY_MS,
}: Options): { bodyIndex: DocsBodyIndex; indexing: boolean } {
  const [bodyIndex, setBodyIndex] = useState<DocsBodyIndex>(() => new Map());
  const [indexing, setIndexing] = useState(false);
  // A static vault's bundled bodies — for search results to point at the same vault
  // as the list (the manifest), the bodies have to come from the same sample. Reading
  // the bundled content.json directly makes "view the example business" search the
  // dogfood bodies.
  const { content: bundledContent } = useStaticVaultSource();
  /** slug → entry cache. Reused across a changed docs array whenever the key matches. */
  const cacheRef = useRef<Map<string, DocsBodyEntry>>(new Map());
  /** Keys that failed — prevents a retry stampede for the same mtime (a change retries). */
  const failedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    const failed = failedKeysRef.current;

    const stale = docs.filter((d) => {
      const key = docBodyCacheKey(d);
      return cache.get(d.slug)?.key !== key && !failed.has(key);
    });

    const publish = () => {
      if (cancelled) return;
      const next = new Map<string, DocsBodyEntry>();
      for (const d of docs) {
        const entry = cache.get(d.slug);
        if (entry) next.set(d.slug, entry);
      }
      setBodyIndex(next);
    };

    if (stale.length === 0) {
      publish();
      setIndexing(false);
      return;
    }

    setIndexing(true);
    const readBody =
      getDocContent ??
      ((slug: string) =>
        fetchServerDocContent(slug, {
          bundledContent,
          locationHref:
            typeof window === 'undefined' ? undefined : window.location.href,
        }));

    const run = async () => {
      const queue = [...stale];
      const worker = async () => {
        for (;;) {
          const doc = queue.shift();
          if (!doc || cancelled) return;
          const key = docBodyCacheKey(doc);
          try {
            const raw = await readBody(doc.slug);
            if (cancelled) return;
            cache.set(doc.slug, buildBodyEntry(raw, key));
          } catch {
            // A document that failed to read is left out of the index — the same version is not retried.
            failed.add(key);
            cache.delete(doc.slug);
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(READ_CONCURRENCY, queue.length) },
          worker,
        ),
      );
      if (cancelled) return;
      publish();
      setIndexing(false);
    };

    const timer = setTimeout(() => void run(), startDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bundledContent, docs, getDocContent, startDelayMs]);

  return { bodyIndex, indexing };
}
