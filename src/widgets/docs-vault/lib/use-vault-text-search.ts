'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { VaultDoc } from '@/entities/docs-vault';
import { useLocalVault } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import type { VaultIndexStatus } from '@/shared/lib/vault-folder/vault-index/tauri-vault-index';
import { useVaultIndexHits } from '@/shared/lib/vault-folder/vault-index/use-vault-index-hits';
import { buildBodyEntry, docBodyCacheKey, type DocsBodyEntry, type DocsBodyIndex } from './body-index';

/** As many as the palette lists; the hit files are read to show the matching line. */
export const TEXT_SEARCH_HITS = 15;
const READ_CONCURRENCY = 6;
const RETAINED_HIT_BODIES = 200;

/**
 * The snippet comes from the body when every term is there; a term matched only in frontmatter
 * shows its frontmatter line instead of dropping the hit.
 */
export function hitEntry(fileText: string, key: string, query: string): DocsBodyEntry {
  const body = buildBodyEntry(fileText, key);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.every((term) => body.lower.includes(term))) return body;
  return { raw: fileText, lower: fileText.toLowerCase(), key };
}

interface Options {
  query: string;
  docs: VaultDoc[];
  getDocContent?: (slug: string) => Promise<string>;
}

/**
 * The palette's search inside documents: the index's best hits, with each hit file read to show
 * its matching line. With no folder open, both results are absent and search covers
 * titles, summaries and tags.
 */
export function useVaultTextSearch({ query, docs, getDocContent }: Options): {
  bodyIndex: DocsBodyIndex | undefined;
  status: VaultIndexStatus | null;
} {
  const { handle } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const { hits, answeredQuery, status } = useVaultIndexHits({
    rootPath,
    query,
    limit: TEXT_SEARCH_HITS,
    enabled: getDocContent !== undefined,
  });
  const [answered, setAnswered] = useState<DocsBodyIndex | undefined>(undefined);
  const fileTextsRef = useRef(new Map<string, string>());
  const docsByPath = useMemo(() => new Map(docs.map((doc) => [doc.path, doc])), [docs]);

  useEffect(() => {
    if (hits === undefined || answeredQuery === null || getDocContent === undefined) return;
    let cancelled = false;
    const hitDocs = hits.flatMap((hit) => docsByPath.get(hit.path) ?? []);
    const entries = new Map<string, DocsBodyEntry>();
    let next = 0;
    const worker = async () => {
      for (let doc = hitDocs[next++]; doc !== undefined && !cancelled; doc = hitDocs[next++]) {
        const key = docBodyCacheKey(doc);
        const fileText = fileTextsRef.current.get(key) ?? (await getDocContent(doc.slug).catch(() => null));
        if (fileText === null) continue;
        fileTextsRef.current.delete(key);
        fileTextsRef.current.set(key, fileText);
        entries.set(doc.slug, hitEntry(fileText, key, answeredQuery));
      }
    };
    void Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, hitDocs.length) }, worker)).then(() => {
      for (const oldest of fileTextsRef.current.keys()) {
        if (fileTextsRef.current.size <= RETAINED_HIT_BODIES) break;
        fileTextsRef.current.delete(oldest);
      }
      if (!cancelled) setAnswered(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [hits, answeredQuery, getDocContent, docsByPath]);

  // The previous answer stays while the next query settles, so rows do not flicker; its texts
  // simply fail the new terms in `searchDocs`.
  const bodyIndex = hits !== undefined && query.trim() !== '' ? answered : undefined;
  return { bodyIndex, status };
}
