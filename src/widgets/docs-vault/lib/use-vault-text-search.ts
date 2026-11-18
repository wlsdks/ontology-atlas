'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { VaultDoc } from '@/entities/docs-vault';
import { useLocalVault } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';
import {
  isVaultIndexAvailable,
  onVaultIndexUpdated,
  searchVaultIndex,
  vaultIndexPreference,
  vaultIndexStatus,
  type VaultIndexStatus,
} from '@/shared/lib/vault-folder/tauri-vault-index';
import { buildBodyEntry, docBodyCacheKey, type DocsBodyEntry, type DocsBodyIndex } from './body-index';

/** As many as the palette lists; the hit files are read to show the matching line. */
export const TEXT_SEARCH_HITS = 15;
const QUERY_SETTLE_MS = 120;
const BUILDING_POLL_MS = 400;
const READ_CONCURRENCY = 6;
const BUILD_STEP_FILES = 2000;
/** Hit bodies kept while typing, so narrowing a query does not re-read the same files. */
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
  /** The document query; empty for command and tag modes. */
  query: string;
  docs: VaultDoc[];
  getDocContent?: (slug: string) => Promise<string>;
}

/**
 * Searches inside every document through the installed app's index. Returns the hit documents'
 * text for `searchDocs` and the index status for the palette's status line; on the web, or with
 * no folder open, both are absent and search covers titles, summaries and tags.
 */
export function useVaultTextSearch({ query, docs, getDocContent }: Options): {
  bodyIndex: DocsBodyIndex | undefined;
  status: VaultIndexStatus | null;
} {
  const { handle } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const indexSwitch = vaultIndexPreference.use();
  const active = rootPath !== null && getDocContent !== undefined && isVaultIndexAvailable();
  const [status, setStatus] = useState<VaultIndexStatus | null>(null);
  const [answered, setAnswered] = useState<DocsBodyIndex | undefined>(undefined);
  /** Counts finished passes that changed rows; an open query asks again on each. */
  const [indexGeneration, setIndexGeneration] = useState(0);
  const fileTextsRef = useRef(new Map<string, string>());
  const docsByPath = useMemo(() => new Map(docs.map((doc) => [doc.path, doc])), [docs]);
  const building = status?.state === 'building' || status?.state === 'absent';
  /** Changes every few thousand files while building, so an open query picks up new matches. */
  const buildStep = building ? Math.floor((status?.indexed ?? 0) / BUILD_STEP_FILES) : -1;

  useEffect(() => {
    if (!active || rootPath === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const next = await vaultIndexStatus(rootPath).catch(() => null);
      if (cancelled) return;
      setStatus(next);
      if (next?.state === 'building' || next?.state === 'absent') timer = setTimeout(() => void poll(), BUILDING_POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, rootPath, indexSwitch]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void onVaultIndexUpdated(() => setIndexGeneration((generation) => generation + 1))
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [active]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!active || rootPath === null || getDocContent === undefined || trimmed === '') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const answer = await searchVaultIndex(rootPath, trimmed, TEXT_SEARCH_HITS).catch(() => null);
      if (cancelled || answer === null) return;
      setStatus(answer.status);
      const hits = answer.hits.flatMap((hit) => docsByPath.get(hit.path) ?? []);
      const entries = new Map<string, DocsBodyEntry>();
      let next = 0;
      const worker = async () => {
        for (let doc = hits[next++]; doc !== undefined && !cancelled; doc = hits[next++]) {
          const key = docBodyCacheKey(doc);
          const fileText = fileTextsRef.current.get(key) ?? (await getDocContent(doc.slug).catch(() => null));
          if (fileText === null) continue;
          fileTextsRef.current.delete(key);
          fileTextsRef.current.set(key, fileText);
          entries.set(doc.slug, hitEntry(fileText, key, trimmed));
        }
      };
      await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, hits.length) }, worker));
      for (const oldest of fileTextsRef.current.keys()) {
        if (fileTextsRef.current.size <= RETAINED_HIT_BODIES) break;
        fileTextsRef.current.delete(oldest);
      }
      if (!cancelled) setAnswered(entries);
    }, QUERY_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, rootPath, getDocContent, query, docsByPath, buildStep, indexGeneration, indexSwitch]);

  // The previous answer stays while the next query settles, so rows do not flicker; its texts
  // simply fail the new terms in `searchDocs`.
  const bodyIndex = active && query.trim() !== '' ? answered : undefined;
  return { bodyIndex, status: active ? status : null };
}
