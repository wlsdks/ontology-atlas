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

/** Keeps FSA/fetch from stampeding. */
const READ_CONCURRENCY = 6;

const DEFAULT_START_DELAY_MS = 250;

/** Raw plus lowercased characters kept across visits; the least recently used go first. */
export const RETAINED_BODY_CHARS = 8_000_000;

const retainedBodies = new Map<string, DocsBodyEntry>();
let retainedChars = 0;

const entryChars = (entry: DocsBodyEntry) => entry.raw.length + entry.lower.length;

function recallBody(key: string): DocsBodyEntry | undefined {
  const entry = retainedBodies.get(key);
  if (entry === undefined) return undefined;
  retainedBodies.delete(key);
  retainedBodies.set(key, entry);
  return entry;
}

function retainBody(key: string, entry: DocsBodyEntry): void {
  const previous = retainedBodies.get(key);
  if (previous !== undefined) {
    retainedBodies.delete(key);
    retainedChars -= entryChars(previous);
  }
  retainedBodies.set(key, entry);
  retainedChars += entryChars(entry);
  for (const [oldestKey, oldest] of retainedBodies) {
    if (retainedChars <= RETAINED_BODY_CHARS) break;
    retainedBodies.delete(oldestKey);
    retainedChars -= entryChars(oldest);
  }
}

interface Options {
  docs: VaultDoc[];
  /** False until the palette first opens. */
  enabled: boolean;
  /** `useVaultSessionIdentityScope()` */
  scope: string;
  /** A local vault's reader; unset reads the static vault. */
  getDocContent?: (slug: string) => Promise<string>;
  startDelayMs?: number;
}

/** Lazily indexes changed bodies with O(1) dequeue per pending document. */
export function useDocsBodyIndex({
  docs,
  enabled,
  scope,
  getDocContent,
  startDelayMs = DEFAULT_START_DELAY_MS,
}: Options): { bodyIndex: DocsBodyIndex; indexing: boolean } {
  const [bodyIndex, setBodyIndex] = useState<DocsBodyIndex>(() => new Map());
  const [indexing, setIndexing] = useState(false);
  // Bundled bodies must come from the same sample as the manifest, or search points at another
  // vault's bodies.
  const { content: bundledContent } = useStaticVaultSource();
  /** This page's whole index, past the retained cap. */
  const cacheRef = useRef<{ scope: string; entries: Map<string, DocsBodyEntry> }>({ scope, entries: new Map() });
  /** A failed version is not read again; a change retries. */
  const failedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (cacheRef.current.scope !== scope) cacheRef.current = { scope, entries: new Map() };
    const cache = cacheRef.current.entries;
    const failed = failedKeysRef.current;
    const retainedKey = (key: string) => `${scope}\u0000${key}`;

    for (const doc of docs) {
      const key = docBodyCacheKey(doc);
      if (cache.get(doc.slug)?.key === key) continue;
      const retained = recallBody(retainedKey(key));
      if (retained !== undefined) cache.set(doc.slug, retained);
    }
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
      let nextDocIndex = 0;
      const worker = async () => {
        for (;;) {
          const doc = stale[nextDocIndex++];
          if (!doc || cancelled) return;
          const key = docBodyCacheKey(doc);
          try {
            const raw = await readBody(doc.slug);
            if (cancelled) return;
            const entry = buildBodyEntry(raw, key);
            cache.set(doc.slug, entry);
            retainBody(retainedKey(key), entry);
          } catch {
            failed.add(key);
            cache.delete(doc.slug);
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(READ_CONCURRENCY, stale.length) },
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
  }, [bundledContent, docs, enabled, getDocContent, scope, startDelayMs]);

  return { bodyIndex, indexing };
}
