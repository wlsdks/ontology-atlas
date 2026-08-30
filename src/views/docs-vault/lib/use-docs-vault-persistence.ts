'use client';

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  readPinnedDocs,
  readRecentDocs,
  togglePinnedDoc,
} from '@/widgets/docs-vault';
import type { VaultRecentKey } from '@/widgets/docs-vault';
import { scheduleStateSync } from './persistence';

/**
 * The pinned/recent document persistence flow extracted from `DocsVaultPage`.
 *
 * Encapsulated here: the `recentKey` memo (the current vault's namespace — the local folder name,
 * or 'server'), the `recentSlugs` / `pinnedSlugs` state, rehydration on `recentKey` change, the
 * `togglePin` callback (which persists automatically), and the derived `pinnedSet`.
 *
 * The setters (`setRecentSlugs`, `setPinnedSlugs`) are exposed as well, because the view's various
 * mutation sites (delete, new document, and so on) call them directly.
 */

interface LocalVaultLike {
  handle: FileSystemDirectoryHandle | null;
}

interface UseDocsVaultPersistenceArgs {
  source: 'server' | 'local';
  localVault: LocalVaultLike;
}

interface UseDocsVaultPersistenceResult {
  recentKey: VaultRecentKey;
  recentSlugs: string[];
  setRecentSlugs: Dispatch<SetStateAction<string[]>>;
  pinnedSlugs: string[];
  setPinnedSlugs: Dispatch<SetStateAction<string[]>>;
  pinnedSet: Set<string>;
  togglePin: (slug: string) => void;
}

export function useDocsVaultPersistence({
  source,
  localVault,
}: UseDocsVaultPersistenceArgs): UseDocsVaultPersistenceResult {
  /**
   * This vault's storage namespace.
   *
   * **A local source with no folder chosen yet is still not `server`** (owner report from real
   * use, 2026-07-28). It used to fall back to `'server'` whenever `source === 'local'` had no
   * handle. So switching to local with documents open from the sample — the state before choosing
   * a folder — left **the sample's open tabs sitting on the local screen**. The user changes the
   * source and sees the previous source's documents still pinned at the top.
   *
   * The source the user chose decides the namespace. "No folder chosen" is not "sample"; it is the
   * separate state **"local, without a folder yet"**.
   */
  const recentKey = useMemo<VaultRecentKey>(() => {
    if (source === 'local') {
      return localVault.handle ? `local:${localVault.handle.name}` : 'local:';
    }
    return 'server';
  }, [source, localVault.handle]);

  const [recentSlugs, setRecentSlugsInternal] = useState<string[]>([]);
  const [pinnedSlugs, setPinnedSlugsInternal] = useState<string[]>([]);

  // ESLint's react-hooks/exhaustive-deps cannot track the stability of a destructured setter, so
  // the `useCallback` wrapper states it is ref-stable. A setState setter is stable by construction,
  // so there is no functional effect.
  const setRecentSlugs = useCallback<typeof setRecentSlugsInternal>(
    (next) => setRecentSlugsInternal(next),
    [],
  );
  const setPinnedSlugs = useCallback<typeof setPinnedSlugsInternal>(
    (next) => setPinnedSlugsInternal(next),
    [],
  );

  // Load that vault's recent and pinned lists whenever `recentKey` changes.
  useEffect(() => {
    scheduleStateSync(() => {
      setRecentSlugsInternal(readRecentDocs(recentKey));
      setPinnedSlugsInternal(readPinnedDocs(recentKey));
    });
  }, [recentKey]);

  const togglePin = useCallback(
    (slug: string) => {
      setPinnedSlugsInternal(togglePinnedDoc(recentKey, slug));
    },
    [recentKey],
  );

  const pinnedSet = useMemo(() => new Set(pinnedSlugs), [pinnedSlugs]);

  return {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin,
  };
}
