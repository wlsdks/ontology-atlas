'use client';

import { useEffect, useRef, useState } from 'react';
import { type VaultDoc } from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/entities/vault-session';
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
   * A local vault's slug to raw md reader (the viewer's source); unset means a static vault read
   * from the bundled content.json or a `/docs-vault/{slug}.md` fetch.
   */
  getDocContent?: (slug: string) => Promise<string>;
  /** Test-only override of the build start delay. */
  startDelayMs?: number;
}

/**
 * The palette's in-memory body index: reads and lowercases every body on load and re-reads only
 * documents whose docBodyCacheKey changed.
 */
export function useDocsBodyIndex({
  docs,
  getDocContent,
  startDelayMs = DEFAULT_START_DELAY_MS,
}: Options): { bodyIndex: DocsBodyIndex; indexing: boolean } {
  const [bodyIndex, setBodyIndex] = useState<DocsBodyIndex>(() => new Map());
  const [indexing, setIndexing] = useState(false);
  // Bundled bodies must come from the same sample as the manifest, or search points at another
  // vault's bodies.
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
